import type { IncomingMessage, ServerResponse } from 'node:http'

import type { DesktopContext } from '@newframe/desktop-api/router'
import type { AiSessionConnect, AiSessionDescriptor } from '@newframe/desktop-api/schemas'
import { TRPCError } from '@trpc/server'

import { createAiSessionClientSource, createLocalApiSource } from '../../../app/main/gateway/requestSource.ts'
import type { RpcIpcHandlers } from '../../../app/main/ipc-handlers/rpc.ts'
import type { Accounts } from '../../../features/accounts/main/index.ts'
import type { AiSessionRequest } from '../../../features/requests/contract/requests.ts'
import type { PromptedRequestContinuationPort } from '../../../features/requests/main/service.ts'
import type { FlashService } from '../../features/trading/index.ts'
import type { CanonicalStoreReader } from '../../state/store/actions.ts'
import { rpcCall } from '../local-api/trpc.ts'
import { AiSessionStore } from './sessionStore.ts'

const CONNECTION_TIMEOUT_MS = 2 * 60 * 1_000
const MAX_PENDING_CONNECTIONS = 8
const AI_SESSION_ORIGIN = 'newframe-ai-session'

type PendingConnection = {
  accountId: string
  descriptor: AiSessionDescriptor
  durationSeconds: number
  request: AiSessionRequest
  timer: NodeJS.Timeout
}

export function createAiSessionService(
  accounts: Accounts,
  flashService: FlashService,
  canonicalStore: CanonicalStoreReader,
  requests: PromptedRequestContinuationPort
) {
  const pendingConnections = new Map<string, PendingConnection>()
  const sessionStore = new AiSessionStore()

  function isHotAccount(accountId: string) {
    const account = accounts.get(accountId)
    return Boolean(
      account && !account.safe && ['ring', 'seed'].includes(account.lastSignerType.toLowerCase())
    )
  }

  function isReadyAiSessionAccount(accountId: string) {
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
    const value = req.headers['x-newframe-ai-session']
    return typeof value === 'string' ? value : ''
  }

  function authenticate(req: IncomingMessage) {
    const sessionId = requestedSessionId(req)
    const sessionToken = authorization(req)
    if (!sessionId || !sessionToken) {
      return
    }

    const session = sessionStore.authenticate(sessionId, sessionToken)
    if (!session || !isReadyAiSessionAccount(session.accountId)) {
      return
    }

    return {
      session,
      requestSource: createAiSessionClientSource({
        sessionId: session.sessionId,
        accountId: session.accountId,
        expiresAt: session.expiresAt,
        isActive: () =>
          sessionStore.isActive(session.sessionId, session.accountId) &&
          isReadyAiSessionAccount(session.accountId)
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

  function connectSession(
    input: AiSessionConnect,
    onClose: (callback: () => void) => void
  ): Promise<unknown> {
    if (pendingConnections.size >= MAX_PENDING_CONNECTIONS) {
      throw new TRPCError({
        code: 'TOO_MANY_REQUESTS',
        message: 'Too many pending AI session requests'
      })
    }
    const account = accounts.current()
    if (!account || !account.agentEnabled || !isHotAccount(account.id)) {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Select an AI-enabled hot wallet in Newframe first' })
    }

    return new Promise((resolve, reject) => {
      let requestId = ''
      requestId = requests.create((response) => {
        clearPending(requestId)
        if (response.error) {
          reject(new TRPCError({ code: 'FORBIDDEN', message: response.error.message }))
          return
        }
        resolve(response.result)
      })
      const request: AiSessionRequest = {
        type: 'aiSession',
        requestId,
        origin: AI_SESSION_ORIGIN,
        account: account.id,
        payload: {
          id: requestId,
          jsonrpc: '2.0',
          method: 'ai_session_connect',
          params: []
        },
        data: input,
        created: Date.now()
      }

      const cancel = (message: string) => {
        const pending = pendingConnections.get(requestId)
        if (!pending) {
          return
        }
        accounts.getFrameAccount(pending.accountId)?.rejectRequest(pending.request, { code: 4001, message })
        clearPending(requestId)
        reject(new TRPCError({ code: 'FORBIDDEN', message }))
      }
      const timer = setTimeout(() => cancel('AI session request expired'), CONNECTION_TIMEOUT_MS)

      pendingConnections.set(requestId, {
        accountId: account.id,
        descriptor: input.descriptor,
        durationSeconds: input.durationSeconds,
        request,
        timer
      })

      onClose(() => cancel('AI session client disconnected before approval'))

      const requestSource = createLocalApiSource({
        transport: 'http',
        connectionId: requestId,
        origin: AI_SESSION_ORIGIN
      })

      const routed = accounts.routeRequest(requestSource, request)

      if (!routed) {
        clearPending(requestId)
        reject(new TRPCError({ code: 'FORBIDDEN', message: 'AI session denied' }))
      }
    })
  }

  type AiSessionProviderPort = Pick<RpcIpcHandlers, 'send'>

  function aiSessionContext(
    req: IncomingMessage,
    provider: AiSessionProviderPort,
    onClose: (callback: () => void) => void
  ): DesktopContext {
    const requireSession = () => {
      if (req.headers.origin) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'AI session API does not accept browser-originated requests'
        })
      }
      const authenticated = authenticate(req)
      if (!authenticated) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Invalid or expired AI session' })
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
              _origin: AI_SESSION_ORIGIN
            },
            respond,
            authenticated.requestSource
          )
        )
      },
      aiSession: req.headers.origin
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
              flashService.stopAiSession(sessionId)
            }
          }
    }
  }

  function resolveAiSessionRequest(requestId: string, approved: boolean) {
    const pending = pendingConnections.get(requestId)
    if (!pending) {
      return false
    }

    const account = accounts.getFrameAccount(pending.accountId)
    const request = account?.getRequest<AiSessionRequest>(requestId)
    if (!account || request?.type !== 'aiSession') {
      return false
    }
    if (request.authorization?.decision !== 'prompt') {
      return false
    }

    if (!approved) {
      account.rejectRequest(request, { code: 4001, message: 'User rejected the AI session' })
      clearPending(requestId)
      return true
    }

    if (!isReadyAiSessionAccount(pending.accountId)) {
      account.rejectRequest(request, { code: 4100, message: 'AI wallet is locked or unavailable' })
      clearPending(requestId)
      return true
    }

    const credentials = sessionStore.create(pending.accountId, pending.descriptor, pending.durationSeconds)
    flashService.startAiSession({
      sessionId: credentials.sessionId,
      accountAddress: credentials.account,
      expiresAt: credentials.expiresAt
    })
    account.resolveRequest(request, credentials)
    clearPending(requestId)
    return true
  }

  function setAiSessionsEnabled(accountId: string, enabled: boolean) {
    const account = accounts.getFrameAccount(accountId)
    if (!account || accounts.get(accountId)?.safe || (enabled && !isHotAccount(accountId))) {
      return false
    }

    account.patch({ agentEnabled: enabled })
    if (!enabled) {
      sessionStore.revokeAccount(accountId)
      flashService.stopAiSessionsForAccount(accountId)
    }
    return true
  }

  function revokeAiSessions(accountId: string) {
    if (!accounts.get(accountId)) {
      return false
    }
    sessionStore.revokeAccount(accountId)
    flashService.stopAiSessionsForAccount(accountId)
    return true
  }

  return {
    createContext: (req: IncomingMessage, res: ServerResponse, provider: AiSessionProviderPort) =>
      aiSessionContext(req, provider, (callback) => res.once('close', callback)),
    dispose() {
      for (const pending of pendingConnections.values()) {
        accounts.getFrameAccount(pending.accountId)?.rejectRequest(pending.request, {
          code: 4001,
          message: 'AI session service stopped before approval'
        })
      }
    },
    resolveAiSessionRequest,
    revokeAiSessions,
    setAiSessionsEnabled
  }
}

export type AiSessionService = ReturnType<typeof createAiSessionService>
