import { randomUUID } from 'node:crypto'

import type {
  AccountRequest,
  RequestAuthorization,
  RequestType
} from '../../../features/requests/contract/requests.js'
import type {
  AuthorizationContext,
  RendererEntrypoint,
  RendererRole
} from '../../../platform/ipc/main/authorization.js'

const requestSourceBrand = Symbol('newframe.request-source')
const admittedSources = new WeakSet<object>()
function admit<T extends object>(source: T): Readonly<T> {
  admittedSources.add(source)
  return Object.freeze(source)
}

type RequestSourceBrand = { readonly [requestSourceBrand]: true }

export type NewframeInternalSource = RequestSourceBrand & {
  readonly kind: 'renderer'
  readonly participant: 'newframe-internal'
  readonly role: RendererRole
  readonly entrypoint: RendererEntrypoint
  readonly webContentsId: number
  readonly windowInstanceId: string
}

export type TrustedCapability = 'wallet:internal-state'

export type LocalApiSource = RequestSourceBrand & {
  readonly kind: 'rpc'
  readonly participant: 'local-api-client' | 'website' | 'companion-extension'
  readonly websiteOrigin?: string
  readonly transport: 'http' | 'websocket'
  readonly connectionId: string
  readonly origin: string
  readonly capabilities: readonly TrustedCapability[]
}

export type AiSessionAuthority = {
  readonly sessionId: string
  readonly accountId: string
  readonly expiresAt: number
  readonly isActive: () => boolean
}

export type AiSessionClientSource = RequestSourceBrand & {
  readonly kind: 'agent'
  readonly participant: 'local-api-client'
  readonly aiSession: AiSessionAuthority
}

export type MainProcessSource = RequestSourceBrand & {
  readonly kind: 'main'
  readonly participant: 'main-process'
  readonly component: string
  readonly capabilities: readonly TrustedCapability[]
}

export type RequestSource =
  | NewframeInternalSource
  | LocalApiSource
  | AiSessionClientSource
  | MainProcessSource

type GatewayOperationIntent = {
  readonly id: string
  readonly requestType: RequestType
  readonly account: string
  readonly method: string
  readonly principal: RequestAuthorization['principal']
}

export type GatewayOperationDecision =
  | { readonly outcome: 'reject'; readonly reason: string }
  | { readonly outcome: 'prompt'; readonly authorization: RequestAuthorization }
  | { readonly outcome: 'autonomous'; readonly authorization: RequestAuthorization }

const signingRequestTypes = new Set<RequestType>(['sign', 'signTypedData', 'signErc20Permit', 'transaction'])

const sideTrayRequestTypes = new Set<RequestType>(['signTypedData', 'signErc20Permit', 'transaction'])
const requestTypes = new Set<RequestType>([
  'sign',
  'signTypedData',
  'signErc20Permit',
  'transaction',
  'agentAccess',
  'access',
  'addChain',
  'switchChain',
  'addToken'
])

export function isRequestSource(value: unknown): value is RequestSource {
  return typeof value === 'object' && value !== null && admittedSources.has(value)
}

function summarizeRequestSource(principal: RequestSource): RequestAuthorization['principal'] {
  if (principal.kind === 'renderer') {
    return {
      kind: 'renderer',
      role: principal.role,
      entrypoint: principal.entrypoint,
      webContentsId: principal.webContentsId,
      windowInstanceId: principal.windowInstanceId
    }
  }

  if (principal.kind === 'rpc') {
    return {
      kind: 'rpc',
      transport: principal.transport,
      connectionId: principal.connectionId,
      origin: principal.origin
    }
  }

  if (principal.kind === 'agent') {
    return {
      kind: 'agent',
      sessionId: principal.aiSession.sessionId,
      accountId: principal.aiSession.accountId,
      expiresAt: principal.aiSession.expiresAt
    }
  }

  return { kind: 'main', component: principal.component }
}

export function createNewframeInternalSource(context: AuthorizationContext): NewframeInternalSource {
  return admit({
    [requestSourceBrand]: true as const,
    kind: 'renderer' as const,
    participant: 'newframe-internal' as const,
    role: context.clientType,
    entrypoint: context.entrypoint,
    webContentsId: context.webContentsId,
    windowInstanceId: context.windowInstanceId
  })
}

export function createLocalApiSource(input: {
  participant?: LocalApiSource['participant']
  websiteOrigin?: string
  transport: LocalApiSource['transport']
  connectionId: string
  origin: string
  capabilities?: readonly TrustedCapability[]
}): LocalApiSource {
  return admit({
    [requestSourceBrand]: true as const,
    kind: 'rpc' as const,
    participant: input.participant ?? 'local-api-client',
    ...(input.websiteOrigin ? { websiteOrigin: input.websiteOrigin } : {}),
    transport: input.transport,
    connectionId: input.connectionId,
    origin: input.origin,
    capabilities: Object.freeze(input.participant === 'website' ? [] : [...(input.capabilities ?? [])])
  })
}

export function createAiSessionClientSource(input: AiSessionAuthority): AiSessionClientSource {
  return admit({
    [requestSourceBrand]: true as const,
    kind: 'agent' as const,
    participant: 'local-api-client' as const,
    aiSession: Object.freeze({ ...input, accountId: input.accountId.toLowerCase() })
  })
}

export function isAiSessionActive(principal: unknown): principal is AiSessionClientSource {
  if (
    !isRequestSource(principal) ||
    principal.kind !== 'agent' ||
    principal.aiSession.expiresAt <= Date.now()
  ) {
    return false
  }

  try {
    return principal.aiSession.isActive()
  } catch {
    return false
  }
}

export function hasSourceCapability(principal: unknown, capability: TrustedCapability) {
  return (
    isRequestSource(principal) &&
    (principal.kind === 'main' || (principal.kind === 'rpc' && principal.participant !== 'website')) &&
    principal.capabilities.includes(capability)
  )
}

export function createMainProcessSource(
  component: string,
  capabilities: readonly TrustedCapability[] = []
): MainProcessSource {
  return admit({
    [requestSourceBrand]: true as const,
    kind: 'main' as const,
    participant: 'main-process' as const,
    component,
    capabilities: Object.freeze([...capabilities])
  })
}

function buildOperationIntent(
  principal: RequestSource,
  request: AccountRequest
): GatewayOperationIntent | undefined {
  if (!requestTypes.has(request.type) || !request.account || !request.handlerId || !request.payload.method) {
    return
  }

  return Object.freeze({
    id: randomUUID(),
    requestType: request.type,
    account: request.account.toLowerCase(),
    method: request.payload.method,
    principal: summarizeRequestSource(principal)
  })
}

function sourceMayRequest(principal: RequestSource, requestType: RequestType) {
  if (principal.kind === 'agent') {
    return signingRequestTypes.has(requestType)
  }
  if (principal.kind !== 'renderer') {
    return true
  }
  if (principal.role === 'sidetray') {
    return sideTrayRequestTypes.has(requestType)
  }

  // Wallet UI requests are created by reviewed workflows such as replacement transactions.
  // Access and network requests originate at the RPC transports, never in the renderer.
  return signingRequestTypes.has(requestType)
}

/**
 * The one policy decision point for account-affecting requests.
 *
 * Ordinary trusted sources require a prompt. A live agent session can act autonomously only for
 * signing requests scoped to its approved account.
 */
export function authorizeGatewayOperation(
  principal: unknown,
  request: AccountRequest
): GatewayOperationDecision {
  if (!isRequestSource(principal)) {
    return { outcome: 'reject', reason: 'Untrusted request source' }
  }

  const action = buildOperationIntent(principal, request)
  if (!action) {
    return { outcome: 'reject', reason: 'Malformed wallet action' }
  }
  if (!sourceMayRequest(principal, request.type)) {
    return { outcome: 'reject', reason: 'Request source is not allowed to perform this action' }
  }

  if (principal.kind === 'agent') {
    if (principal.aiSession.expiresAt <= Date.now()) {
      return { outcome: 'reject', reason: 'Agent session expired' }
    }
    if (!isAiSessionActive(principal)) {
      return { outcome: 'reject', reason: 'Agent session is revoked or unavailable' }
    }
    if (action.account !== principal.aiSession.accountId) {
      return { outcome: 'reject', reason: 'Agent session is not authorized for this account' }
    }

    return {
      outcome: 'autonomous',
      authorization: Object.freeze({
        actionId: action.id,
        decision: 'autonomous' as const,
        decidedAt: Date.now(),
        principal: action.principal,
        intent: {
          requestType: action.requestType,
          account: action.account,
          method: action.method
        }
      })
    }
  }

  return {
    outcome: 'prompt',
    authorization: Object.freeze({
      actionId: action.id,
      decision: 'prompt' as const,
      decidedAt: Date.now(),
      principal: action.principal,
      intent: {
        requestType: action.requestType,
        account: action.account,
        method: action.method
      }
    })
  }
}
