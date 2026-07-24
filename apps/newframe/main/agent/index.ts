import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import log from 'electron-log'
import { z } from 'zod'

import accounts from '../accounts'
import { flashService } from '../flash/instance'
import provider from '../provider'
import store from '../store'
import { createAgentPrincipal, createRpcPrincipal } from '../authority'
import type { AgentAccessRequest } from '../accounts/types'
import { observeResponseClose, PendingConnectionLimiter } from './connectionLifecycle'
import { AgentSessionStore, type AgentDescriptor } from './sessionStore'

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

const sessionStore = new AgentSessionStore()
const pendingConnections = new Map<string, PendingConnection>()
const pendingConnectionLimiter = new PendingConnectionLimiter(
  MAX_PENDING_CONNECTIONS,
  () => pendingConnections.size
)

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

function isHotAccount(accountId: string) {
  const account = accounts.get(accountId)
  return Boolean(account && ['ring', 'seed'].includes(account.lastSignerType.toLowerCase()))
}

function isReadyAgentAccount(accountId: string) {
  const accountState = accounts.get(accountId)
  const account = accounts.getFrameAccount(accountId)
  const signer = account?.getSigner()
  return Boolean(
    accountState?.agentEnabled &&
    isHotAccount(accountId) &&
    !store.getState().main.appLock.locked &&
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

function authenticate(req: IncomingMessage) {
  const sessionId = requestedSessionId(req)
  const sessionToken = authorization(req)
  if (!sessionId || !sessionToken) return

  const session = sessionStore.authenticate(sessionId, sessionToken)
  if (!session || !isReadyAgentAccount(session.accountId)) return

  return {
    session,
    principal: createAgentPrincipal({
      sessionId: session.sessionId,
      accountId: session.accountId,
      expiresAt: session.expiresAt,
      isActive: () =>
        sessionStore.isActive(session.sessionId, session.accountId) && isReadyAgentAccount(session.accountId)
    })
  }
}

function clearPending(requestId: string) {
  const pending = pendingConnections.get(requestId)
  if (!pending) return
  clearTimeout(pending.timer)
  pendingConnections.delete(requestId)
}

async function connect(req: IncomingMessage, res: ServerResponse) {
  if (!pendingConnectionLimiter.tryReserve()) {
    return sendJson(res, 429, { error: 'Too many pending agent connection requests' })
  }

  let parsed: ReturnType<typeof ConnectSchema.safeParse>
  try {
    parsed = ConnectSchema.safeParse(await readJson(req))
  } finally {
    pendingConnectionLimiter.release()
  }

  if (!parsed.success) return sendJson(res, 400, { error: 'Invalid agent connection request' })
  if (!pendingConnectionLimiter.hasCapacity()) {
    return sendJson(res, 429, { error: 'Too many pending agent connection requests' })
  }

  const account = accounts.current()
  if (!account || !account.agentEnabled || !isHotAccount(account.id)) {
    return sendJson(res, 403, { error: 'Select an AI-enabled hot wallet in Newframe first' })
  }

  const handlerId = randomUUID()
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
    const pending = pendingConnections.get(handlerId)
    if (!pending) return
    accounts.getFrameAccount(pending.accountId)?.rejectRequest(pending.request, {
      code: 4001,
      message: 'Agent connection request expired'
    })
    clearPending(handlerId)
  }, CONNECTION_TIMEOUT_MS)

  pendingConnections.set(handlerId, {
    accountId: account.id,
    descriptor: parsed.data.descriptor,
    durationSeconds: parsed.data.durationSeconds,
    request,
    timer
  })

  observeResponseClose(
    res,
    () => pendingConnections.has(handlerId),
    () => {
      const pending = pendingConnections.get(handlerId)
      if (!pending) return
      accounts.getFrameAccount(pending.accountId)?.rejectRequest(pending.request, {
        code: 4001,
        message: 'Agent disconnected before approval'
      })
      clearPending(handlerId)
    }
  )

  const principal = createRpcPrincipal({
    transport: 'http',
    connectionId: handlerId,
    origin: AGENT_ORIGIN
  })

  const routed = accounts.routeRequest(principal, request, (response) => {
    clearPending(handlerId)
    if (response.error) return sendJson(res, 403, { error: response.error.message })
    sendJson(res, 200, response.result)
  })

  if (!routed) {
    clearPending(handlerId)
    sendJson(res, 403, { error: 'Agent connection request could not be routed' })
  }
}

async function rpc(req: IncomingMessage, res: ServerResponse) {
  const authenticated = authenticate(req)
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

async function revoke(req: IncomingMessage, res: ServerResponse, sessionId: string) {
  const authenticated = authenticate(req)
  if (!authenticated || authenticated.session.sessionId !== sessionId) {
    return sendJson(res, 401, { error: 'Invalid or expired agent session' })
  }

  sessionStore.revoke(sessionId)
  flashService.stopAgentSession(sessionId)
  if (!res.writableEnded) res.writeHead(204, { 'Cache-Control': 'no-store' }).end()
}

export function isAgentHttpRequest(req: IncomingMessage) {
  return new URL(req.url || '/', 'http://127.0.0.1').pathname.startsWith('/agent/')
}

export async function handleAgentHttpRequest(req: IncomingMessage, res: ServerResponse) {
  try {
    if (req.headers.origin) {
      return sendJson(res, 403, { error: 'Agent API does not accept browser-originated requests' })
    }
    const pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname
    if (req.method === 'POST' && pathname === '/agent/session') return await connect(req, res)
    if (req.method === 'POST' && pathname === '/agent/rpc') return await rpc(req, res)
    if (req.method === 'DELETE' && pathname.startsWith('/agent/session/')) {
      return await revoke(req, res, decodeURIComponent(pathname.slice('/agent/session/'.length)))
    }

    sendJson(res, 404, { error: 'Unknown agent endpoint' })
  } catch (error) {
    log.warn('Agent API request failed', error)
    sendJson(res, 400, { error: error instanceof Error ? error.message : 'Agent request failed' })
  }
}

export function resolveAgentAccessRequest(requestId: string, approved: boolean) {
  const pending = pendingConnections.get(requestId)
  if (!pending) return false

  const account = accounts.getFrameAccount(pending.accountId)
  const request = account?.getRequest<AgentAccessRequest>(requestId)
  if (!account || !request || request.type !== 'agentAccess') return false
  if (request.authorization?.decision !== 'prompt') return false

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

export function setAgentAccess(accountId: string, enabled: boolean) {
  const account = accounts.getFrameAccount(accountId)
  if (!account || (enabled && !isHotAccount(accountId))) return false

  account.patch({ agentEnabled: enabled })
  if (!enabled) {
    sessionStore.revokeAccount(accountId)
    flashService.stopAgentSessionsForAccount(accountId)
  }
  return true
}

export function revokeAgentSessions(accountId: string) {
  if (!accounts.get(accountId)) return false
  sessionStore.revokeAccount(accountId)
  flashService.stopAgentSessionsForAccount(accountId)
  return true
}
