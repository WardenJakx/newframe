import type { IncomingMessage, ServerResponse } from 'node:http'

import type { DesktopContext } from '@newframe/desktop-api/router'
import type { AgentConnect, AgentDescriptor } from '@newframe/desktop-api/schemas'
import { TRPCError } from '@trpc/server'

import { createAiSessionClientSource, createLocalApiSource } from '../../../app/main/gateway/requestSource.ts'
import type { RpcIpcHandlers } from '../../../app/main/ipc-handlers/rpc.ts'
import { rpcCall } from '../../../platform/local-rpc/trpc.ts'
import type { CanonicalStoreReader } from '../../../platform/state-store/actions.ts'
import type { Accounts } from '../../accounts/main/index.ts'
import type { AgentAccessRequest } from '../../requests/contract/requests.ts'
import type { PromptedRequestContinuationPort } from '../../requests/main/service.ts'
import type { FlashService } from '../../transactions/trade/main/index.ts'
import { AgentSessionStore } from './sessionStore.ts'

const CONNECTION_TIMEOUT_MS = 2 * 60 * 1_000
const MAX_PENDING_CONNECTIONS = 8
const AGENT_ORIGIN = 'newframe-agent'

type PendingConnection = {
  accountId: string
  descriptor: AgentDescriptor
  durationSeconds: number
  request: AgentAccessRequest
  timer: NodeJS.Timeout
}

export function createAgentService(
  accounts: Accounts,
  flashService: FlashService,
  canonicalStore: CanonicalStoreReader,
  requests: PromptedRequestContinuationPort
) {
  const pendingConnections = new Map<string, PendingConnection>()
  const sessionStore = new AgentSessionStore()

  function isHotAccount(accountId: string) {
    const account = accounts.get(accountId)
    return Boolean(
      account && !account.safe && ['ring', 'seed'].includes(account.lastSignerType.toLowerCase())
    )
  }

  function isReadyAgentAccount(accountId: string) {
    const accountState = accounts.get(accountId)
    const account = accounts.getFrameAccount(accountId)
    const signer = account?.getSigner()
    return Boolean(
      accountState?.agentEnabled &&
      isHotAccount(accountId) &&
      !canonicalStore.getState().main.appLock.locked &&
      signer &&
      ['ring', 'seed'].includes(signer.type.toLowerCase()) &&
      signer.status === 'ok'
    )
  }

  function authorization(req: IncomingMessage) {
    const value = req.headers.authorization ?? ''
    return value.startsWith('Bearer ') ? value.slice('Bearer '.length) : ''
  }

  function requestedSessionId(req: IncomingMessage) {
    const value = req.headers['x-newframe-agent-session']
    return typeof value === 'string' ? value : ''
  }

  function authenticate(req: IncomingMessage) {
    const sessionId = requestedSessionId(req)
    const sessionToken = authorization(req)
    if (!sessionId || !sessionToken) {
      return
    }

    const session = sessionStore.authenticate(sessionId, sessionToken)
    if (!session || !isReadyAgentAccount(session.accountId)) {
      return
    }

    return {
      session,
      principal: createAiSessionClientSource({
        sessionId: session.sessionId,
        accountId: session.accountId,
        expiresAt: session.expiresAt,
        isActive: () =>
          sessionStore.isActive(session.sessionId, session.accountId) &&
          isReadyAgentAccount(session.accountId)
      })
    }
  }

  function clearPending(requestId: string) {
    const pending = pendingConnections.get(requestId)
    if (!pending) {
      return
    }
    clearTimeout(pending.timer)
    pendingConnections.delete(requestId)
  }

  function connectSession(input: AgentConnect, onClose: (callback: () => void) => void): Promise<unknown> {
    if (pendingConnections.size >= MAX_PENDING_CONNECTIONS) {
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many pending agent connection requests'
      })
    }
    const account = accounts.current()
    if (!account || !account.agentEnabled || !isHotAccount(account.id)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Select an AI-enabled hot wallet in Newframe first' })
    }

    return new Promise((resolve, reject) => {
      let handlerId = ''
      handlerId = requests.create((response) => {
        clearPending(handlerId)
        if (response.error) {
          reject(new TRPCError({ code: 'FORBIDDEN', message: response.error.message }))
          return
        }
        resolve(response.result)
      })
      const request: AgentAccessRequest = {
        type: 'agentAccess',
        handlerId,
        origin: AGENT_ORIGIN,
        account: account.id,
        payload: {
          id: handlerId,
          jsonrpc: '2.0',
          method: 'agent_connect',
          params: []
        },
        data: input,
        created: Date.now()
      }

      const cancel = (message: string) => {
        const pending = pendingConnections.get(handlerId)
        if (!pending) {
          return
        }
        accounts.getFrameAccount(pending.accountId)?.rejectRequest(pending.request, { code: 4001, message })
        clearPending(handlerId)
        reject(new TRPCError({ code: 'FORBIDDEN', message }))
      }
      const timer = setTimeout(() => cancel('Agent connection request expired'), CONNECTION_TIMEOUT_MS)

      pendingConnections.set(handlerId, {
        accountId: account.id,
        descriptor: input.descriptor,
        durationSeconds: input.durationSeconds,
        request,
        timer
      })

      onClose(() => cancel('Agent disconnected before approval'))

      const principal = createLocalApiSource({
        transport: 'http',
        connectionId: handlerId,
        origin: AGENT_ORIGIN
      })

      const routed = accounts.routeRequest(principal, request)

      if (!routed) {
        clearPending(handlerId)
        reject(new TRPCError({ code: 'FORBIDDEN', message: 'Agent connection denied' }))
      }
    })
  }

  type AgentProviderPort = Pick<RpcIpcHandlers, 'send'>

  function agentContext(
    req: IncomingMessage,
    provider: AgentProviderPort,
    onClose: (callback: () => void) => void
  ): DesktopContext {
    const requireSession = () => {
      if (req.headers.origin) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Agent API does not accept browser-originated requests'
        })
      }
      const authenticated = authenticate(req)
      if (!authenticated) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid or expired agent session' })
      }
      return authenticated
    }
    return {
      rpc: (input) => {
        const authenticated = requireSession()
        const chainHeader = req.headers['x-newframe-chain-id']
        const chainId = input.chainId ?? (typeof chainHeader === 'string' ? chainHeader : undefined)
        return rpcCall((respond) =>
          provider.send(
            {
              id: 1,
              jsonrpc: '2.0',
              method: input.method,
              params: input.params as readonly unknown[],
              ...(chainId === undefined ? {} : { chainId }),
              _origin: AGENT_ORIGIN
            },
            respond,
            authenticated.principal
          )
        )
      },
      agent: req.headers.origin
        ? undefined
        : {
            connect: (input, signal) =>
              connectSession(input, (callback) => {
                onClose(callback)
                signal?.addEventListener('abort', callback, { once: true })
              }),
            status: () => {
              requireSession()
            },
            revoke: (sessionId) => {
              const authenticated = requireSession()
              if (authenticated.session.sessionId !== sessionId) {
                throw new TRPCError({ code: 'UNAUTHORIZED' })
              }
              sessionStore.revoke(sessionId)
              flashService.stopAgentSession(sessionId)
            }
          }
    }
  }

  function resolveAgentAccessRequest(requestId: string, approved: boolean) {
    const pending = pendingConnections.get(requestId)
    if (!pending) {
      return false
    }

    const account = accounts.getFrameAccount(pending.accountId)
    const request = account?.getRequest<AgentAccessRequest>(requestId)
    if (!account || request?.type !== 'agentAccess') {
      return false
    }
    if (request.authorization?.decision !== 'prompt') {
      return false
    }

    if (!approved) {
      account.rejectRequest(request, { code: 4001, message: 'User rejected the agent connection' })
      clearPending(requestId)
      return true
    }

    if (!isReadyAgentAccount(pending.accountId)) {
      account.rejectRequest(request, { code: 4100, message: 'AI wallet is locked or unavailable' })
      clearPending(requestId)
      return true
    }

    const credentials = sessionStore.create(pending.accountId, pending.descriptor, pending.durationSeconds)
    flashService.startAgentSession({
      sessionId: credentials.sessionId,
      accountAddress: credentials.account,
      expiresAt: credentials.expiresAt
    })
    account.resolveRequest(request, credentials)
    clearPending(requestId)
    return true
  }

  function setAgentAccess(accountId: string, enabled: boolean) {
    const account = accounts.getFrameAccount(accountId)
    if (!account || accounts.get(accountId)?.safe || (enabled && !isHotAccount(accountId))) {
      return false
    }

    account.patch({ agentEnabled: enabled })
    if (!enabled) {
      sessionStore.revokeAccount(accountId)
      flashService.stopAgentSessionsForAccount(accountId)
    }
    return true
  }

  function revokeAgentSessions(accountId: string) {
    if (!accounts.get(accountId)) {
      return false
    }
    sessionStore.revokeAccount(accountId)
    flashService.stopAgentSessionsForAccount(accountId)
    return true
  }

  return {
    createContext: (req: IncomingMessage, res: ServerResponse, provider: AgentProviderPort) =>
      agentContext(req, provider, (callback) => res.once('close', callback)),
    dispose() {
      for (const pending of pendingConnections.values()) {
        accounts.getFrameAccount(pending.accountId)?.rejectRequest(pending.request, {
          code: 4001,
          message: 'Agent service stopped before approval'
        })
      }
    },
    resolveAgentAccessRequest,
    revokeAgentSessions,
    setAgentAccess
  }
}

export type AgentService = ReturnType<typeof createAgentService>
