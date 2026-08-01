import type { IncomingMessage, ServerResponse } from 'node:http'
import log from 'electron-log'
import { z } from 'zod'

import type { Accounts } from '../accounts/index.js'
import type { FlashService } from '../flash/index.js'
import type { Provider } from '../provider/index.js'
import type { CanonicalStoreReader } from '../store/actions.js'
import { createAgentPrincipal, createRpcPrincipal } from '../authority.js'
import type { AgentAccessRequest } from '../../contracts/requests.js'
import { observeResponseClose, PendingConnectionLimiter } from './connectionLifecycle.js'
import { AgentSessionStore, type AgentDescriptor } from './sessionStore.js'
import type { PromptedRequestContinuationPort } from '../features/requests/service.js'

const MIN_DURATION_SECONDS = 60
const MAX_DURATION_SECONDS = 180 * 24 * 60 * 60
const CONNECTION_TIMEOUT_MS = 2 * 60 * 1_000
const MAX_PENDING_CONNECTIONS = 8
const MAX_BODY_BYTES = 64 * 1_024
const AGENT_ORIGIN = 'newframe-agent'
const AGENT_RPC_METHODS = new Set([
  'eth_sendTransaction',
  'personal_sign',
  'eth_signTypedData',
  'eth_signTypedData_v3',
  'eth_signTypedData_v4'
])

const DescriptorSchema = z.strictObject({
  name: z.string().trim().min(1).max(128),
  description: z.string().trim().max(512).optional(),
  url: z
    .url({ protocol: /^https?:$/ })
    .max(2_048)
    .optional()
})

const ConnectSchema = z.strictObject({
  descriptor: DescriptorSchema,
  durationSeconds: z.number().int().min(MIN_DURATION_SECONDS).max(MAX_DURATION_SECONDS)
})

type PendingConnection = {
  accountId: string
  descriptor: AgentDescriptor
  durationSeconds: number
  request: AgentAccessRequest
  timer: NodeJS.Timeout
}

interface AgentRuntime {
  store: CanonicalStoreReader
  sessionStore: AgentSessionStore
  pendingConnections: Map<string, PendingConnection>
  pendingConnectionLimiter: PendingConnectionLimiter
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  if (res.writableEnded || res.destroyed) return
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store'
  })
  res.end(JSON.stringify(body))
}

async function readJson(req: IncomingMessage) {
  const chunks: Buffer[] = []
  let size = 0

  for await (const value of req) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value)
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw new Error('Request body is too large')
    chunks.push(chunk)
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}

function isHotAccount(accountId: string, accounts: Accounts) {
  const account = accounts.get(accountId)
  return Boolean(account && ['ring', 'seed'].includes(account.lastSignerType.toLowerCase()))
}

function isReadyAgentAccount(accountId: string, accounts: Accounts, runtime: AgentRuntime) {
  const accountState = accounts.get(accountId)
  const account = accounts.getFrameAccount(accountId)
  const signer = account?.getSigner()
  return Boolean(
    accountState?.agentEnabled &&
    isHotAccount(accountId, accounts) &&
    !runtime.store.getState().main.appLock.locked &&
    signer &&
    ['ring', 'seed'].includes(signer.type.toLowerCase()) &&
    signer.status === 'ok'
  )
}

function authorization(req: IncomingMessage) {
  const value = req.headers.authorization || ''
  return value.startsWith('Bearer ') ? value.slice('Bearer '.length) : ''
}

function requestedSessionId(req: IncomingMessage) {
  const value = req.headers['x-newframe-agent-session']
  return typeof value === 'string' ? value : ''
}

function authenticate(req: IncomingMessage, accounts: Accounts, runtime: AgentRuntime) {
  const sessionId = requestedSessionId(req)
  const sessionToken = authorization(req)
  if (!sessionId || !sessionToken) return

  const session = runtime.sessionStore.authenticate(sessionId, sessionToken)
  if (!session || !isReadyAgentAccount(session.accountId, accounts, runtime)) return

  return {
    session,
    principal: createAgentPrincipal({
      sessionId: session.sessionId,
      accountId: session.accountId,
      expiresAt: session.expiresAt,
      isActive: () =>
        runtime.sessionStore.isActive(session.sessionId, session.accountId) &&
        isReadyAgentAccount(session.accountId, accounts, runtime)
    })
  }
}

function clearPending(requestId: string, runtime: AgentRuntime) {
  const pending = runtime.pendingConnections.get(requestId)
  if (!pending) return
  clearTimeout(pending.timer)
  runtime.pendingConnections.delete(requestId)
}

async function connect(
  req: IncomingMessage,
  res: ServerResponse,
  accounts: Accounts,
  requests: PromptedRequestContinuationPort,
  runtime: AgentRuntime
) {
  if (!runtime.pendingConnectionLimiter.tryReserve()) {
    return sendJson(res, 429, { error: 'Too many pending agent connection requests' })
  }

  let parsed: ReturnType<typeof ConnectSchema.safeParse>
  try {
    parsed = ConnectSchema.safeParse(await readJson(req))
  } finally {
    runtime.pendingConnectionLimiter.release()
  }

  if (!parsed.success) return sendJson(res, 400, { error: 'Invalid agent connection request' })
  if (!runtime.pendingConnectionLimiter.hasCapacity()) {
    return sendJson(res, 429, { error: 'Too many pending agent connection requests' })
  }

  const account = accounts.current()
  if (!account || !account.agentEnabled || !isHotAccount(account.id, accounts)) {
    return sendJson(res, 403, { error: 'Select an AI-enabled hot wallet in Newframe first' })
  }

  let handlerId = ''
  handlerId = requests.create((response) => {
    clearPending(handlerId, runtime)
    if (response.error) return sendJson(res, 403, { error: response.error.message })
    sendJson(res, 200, response.result)
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
    data: parsed.data,
    created: Date.now()
  }

  const timer = setTimeout(() => {
    const pending = runtime.pendingConnections.get(handlerId)
    if (!pending) return
    accounts.getFrameAccount(pending.accountId)?.rejectRequest(pending.request, {
      code: 4001,
      message: 'Agent connection request expired'
    })
    clearPending(handlerId, runtime)
  }, CONNECTION_TIMEOUT_MS)

  runtime.pendingConnections.set(handlerId, {
    accountId: account.id,
    descriptor: parsed.data.descriptor,
    durationSeconds: parsed.data.durationSeconds,
    request,
    timer
  })

  observeResponseClose(
    res,
    () => runtime.pendingConnections.has(handlerId),
    () => {
      const pending = runtime.pendingConnections.get(handlerId)
      if (!pending) return
      accounts.getFrameAccount(pending.accountId)?.rejectRequest(pending.request, {
        code: 4001,
        message: 'Agent disconnected before approval'
      })
      clearPending(handlerId, runtime)
    }
  )

  const principal = createRpcPrincipal({
    transport: 'http',
    connectionId: handlerId,
    origin: AGENT_ORIGIN
  })

  const routed = accounts.routeRequest(principal, request)

  if (!routed) {
    clearPending(handlerId, runtime)
  }
}

type AgentProviderPort = Pick<
  Provider,
  'sendAgentPersonalSign' | 'sendAgentTransaction' | 'sendAgentTypedData'
>

async function rpc(
  req: IncomingMessage,
  res: ServerResponse,
  provider: AgentProviderPort,
  accounts: Accounts,
  runtime: AgentRuntime
) {
  const authenticated = authenticate(req, accounts, runtime)
  if (!authenticated) {
    return sendJson(res, 401, {
      jsonrpc: '2.0',
      id: null,
      error: { code: 4100, message: 'Invalid or expired agent session' }
    })
  }

  const payload = (await readJson(req)) as JSONRPCRequestPayload
  if (
    !payload ||
    payload.jsonrpc !== '2.0' ||
    (typeof payload.id !== 'string' && typeof payload.id !== 'number') ||
    !AGENT_RPC_METHODS.has(payload.method) ||
    !Array.isArray(payload.params)
  ) {
    return sendJson(res, 400, {
      jsonrpc: '2.0',
      id: payload?.id ?? null,
      error: { code: -32600, message: 'Invalid or unsupported agent request' }
    })
  }

  const agentPayload = { ...payload, _origin: AGENT_ORIGIN }
  const respond: RPCRequestCallback = (response) => sendJson(res, response.error ? 400 : 200, response)

  if (payload.method === 'eth_sendTransaction') {
    return provider.sendAgentTransaction(
      agentPayload as RPC.SendTransaction.Request,
      authenticated.principal,
      respond
    )
  }
  if (payload.method === 'personal_sign') {
    return provider.sendAgentPersonalSign(agentPayload, authenticated.principal, respond)
  }
  return provider.sendAgentTypedData(
    agentPayload as RPC.SignTypedData.Request,
    authenticated.principal,
    respond
  )
}

async function revoke(
  req: IncomingMessage,
  res: ServerResponse,
  sessionId: string,
  accounts: Accounts,
  flashService: FlashService,
  runtime: AgentRuntime
) {
  const authenticated = authenticate(req, accounts, runtime)
  if (!authenticated || authenticated.session.sessionId !== sessionId) {
    return sendJson(res, 401, { error: 'Invalid or expired agent session' })
  }

  runtime.sessionStore.revoke(sessionId)
  flashService.stopAgentSession(sessionId)
  if (!res.writableEnded) res.writeHead(204, { 'Cache-Control': 'no-store' }).end()
}

export function isAgentHttpRequest(req: IncomingMessage) {
  return new URL(req.url || '/', 'http://127.0.0.1').pathname.startsWith('/agent/')
}

function createAgentHttpHandler(
  provider: AgentProviderPort,
  accounts: Accounts,
  flashService: FlashService,
  requests: PromptedRequestContinuationPort,
  runtime: AgentRuntime
) {
  return async function handleAgentHttpRequest(req: IncomingMessage, res: ServerResponse) {
    try {
      if (req.headers.origin) {
        return sendJson(res, 403, { error: 'Agent API does not accept browser-originated requests' })
      }
      const pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname
      if (req.method === 'POST' && pathname === '/agent/session') {
        return await connect(req, res, accounts, requests, runtime)
      }
      if (req.method === 'POST' && pathname === '/agent/rpc') {
        return await rpc(req, res, provider, accounts, runtime)
      }
      if (req.method === 'DELETE' && pathname.startsWith('/agent/session/')) {
        return await revoke(
          req,
          res,
          decodeURIComponent(pathname.slice('/agent/session/'.length)),
          accounts,
          flashService,
          runtime
        )
      }

      sendJson(res, 404, { error: 'Unknown agent endpoint' })
    } catch (error) {
      log.warn('Agent API request failed', error)
      sendJson(res, 400, { error: error instanceof Error ? error.message : 'Agent request failed' })
    }
  }
}

function resolveAgentAccessRequest(
  requestId: string,
  approved: boolean,
  accounts: Accounts,
  flashService: FlashService,
  runtime: AgentRuntime
) {
  const pending = runtime.pendingConnections.get(requestId)
  if (!pending) return false

  const account = accounts.getFrameAccount(pending.accountId)
  const request = account?.getRequest<AgentAccessRequest>(requestId)
  if (!account || !request || request.type !== 'agentAccess') return false
  if (request.authorization?.decision !== 'prompt') return false

  if (!approved) {
    account.rejectRequest(request, { code: 4001, message: 'User rejected the agent connection' })
    clearPending(requestId, runtime)
    return true
  }

  if (!isReadyAgentAccount(pending.accountId, accounts, runtime)) {
    account.rejectRequest(request, { code: 4100, message: 'AI wallet is locked or unavailable' })
    clearPending(requestId, runtime)
    return true
  }

  const credentials = runtime.sessionStore.create(
    pending.accountId,
    pending.descriptor,
    pending.durationSeconds
  )
  flashService.startAgentSession({
    sessionId: credentials.sessionId,
    accountAddress: credentials.account,
    expiresAt: credentials.expiresAt
  })
  account.resolveRequest(request, credentials)
  clearPending(requestId, runtime)
  return true
}

function setAgentAccess(
  accountId: string,
  enabled: boolean,
  accounts: Accounts,
  flashService: FlashService,
  runtime: AgentRuntime
) {
  const account = accounts.getFrameAccount(accountId)
  if (!account || (enabled && !isHotAccount(accountId, accounts))) return false

  account.patch({ agentEnabled: enabled })
  if (!enabled) {
    runtime.sessionStore.revokeAccount(accountId)
    flashService.stopAgentSessionsForAccount(accountId)
  }
  return true
}

function revokeAgentSessions(
  accountId: string,
  accounts: Accounts,
  flashService: FlashService,
  runtime: AgentRuntime
) {
  if (!accounts.get(accountId)) return false
  runtime.sessionStore.revokeAccount(accountId)
  flashService.stopAgentSessionsForAccount(accountId)
  return true
}

export function createAgentService(
  accounts: Accounts,
  flashService: FlashService,
  canonicalStore: CanonicalStoreReader,
  requests: PromptedRequestContinuationPort
) {
  const pendingConnections = new Map<string, PendingConnection>()
  const runtime: AgentRuntime = {
    store: canonicalStore,
    sessionStore: new AgentSessionStore(),
    pendingConnections,
    pendingConnectionLimiter: new PendingConnectionLimiter(
      MAX_PENDING_CONNECTIONS,
      () => pendingConnections.size
    )
  }

  return {
    createHttpHandler: (provider: AgentProviderPort) =>
      createAgentHttpHandler(provider, accounts, flashService, requests, runtime),
    dispose() {
      for (const pending of [...pendingConnections.values()]) {
        accounts.getFrameAccount(pending.accountId)?.rejectRequest(pending.request, {
          code: 4001,
          message: 'Agent service stopped before approval'
        })
      }
    },
    resolveAgentAccessRequest: (requestId: string, approved: boolean) =>
      resolveAgentAccessRequest(requestId, approved, accounts, flashService, runtime),
    revokeAgentSessions: (accountId: string) =>
      revokeAgentSessions(accountId, accounts, flashService, runtime),
    setAgentAccess: (accountId: string, enabled: boolean) =>
      setAgentAccess(accountId, enabled, accounts, flashService, runtime)
  }
}

export type AgentService = ReturnType<typeof createAgentService>
