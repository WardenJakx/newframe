import { randomUUID } from 'node:crypto'

import type {
  AccountRequest,
  RequestAuthorization,
  RequestType
} from '../../../features/requests/contract/requests.ts'
import type {
  AuthorizationContext,
  RendererEntrypoint,
  RendererRole
} from '../../../platform/ipc/main/authorization.ts'

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
  readonly participant: 'local-api-client' | 'dapp' | 'extension'
  readonly dappOrigin?: string
  /** Set for the extension's own requests and dapp requests it relays. */
  readonly extensionId?: string
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
  readonly kind: 'ai-session'
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
  readonly requestSource: RequestAuthorization['requestSource']
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
  'aiSession',
  'access',
  'addChain',
  'switchChain',
  'addToken'
])

export function isRequestSource(value: unknown): value is RequestSource {
  return typeof value === 'object' && value !== null && admittedSources.has(value)
}

function summarizeRequestSource(requestSource: RequestSource): RequestAuthorization['requestSource'] {
  if (requestSource.kind === 'renderer') {
    return {
      kind: 'renderer',
      role: requestSource.role,
      entrypoint: requestSource.entrypoint,
      webContentsId: requestSource.webContentsId,
      windowInstanceId: requestSource.windowInstanceId
    }
  }

  if (requestSource.kind === 'rpc') {
    return {
      kind: 'rpc',
      transport: requestSource.transport,
      connectionId: requestSource.connectionId,
      origin: requestSource.origin
    }
  }

  if (requestSource.kind === 'ai-session') {
    return {
      kind: 'ai-session',
      sessionId: requestSource.aiSession.sessionId,
      accountId: requestSource.aiSession.accountId,
      expiresAt: requestSource.aiSession.expiresAt
    }
  }

  return { kind: 'main', component: requestSource.component }
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
  dappOrigin?: string
  extensionId?: string
  transport: LocalApiSource['transport']
  connectionId: string
  origin: string
  capabilities?: readonly TrustedCapability[]
}): LocalApiSource {
  return admit({
    [requestSourceBrand]: true as const,
    kind: 'rpc' as const,
    participant: input.participant ?? 'local-api-client',
    ...(input.dappOrigin ? { dappOrigin: input.dappOrigin } : {}),
    ...(input.extensionId ? { extensionId: input.extensionId } : {}),
    transport: input.transport,
    connectionId: input.connectionId,
    origin: input.origin,
    capabilities: Object.freeze(input.participant === 'dapp' ? [] : [...(input.capabilities ?? [])])
  })
}

export function createAiSessionClientSource(input: AiSessionAuthority): AiSessionClientSource {
  return admit({
    [requestSourceBrand]: true as const,
    kind: 'ai-session' as const,
    participant: 'local-api-client' as const,
    aiSession: Object.freeze({ ...input, accountId: input.accountId.toLowerCase() })
  })
}

export function isAiSessionActive(requestSource: unknown): requestSource is AiSessionClientSource {
  if (
    !isRequestSource(requestSource) ||
    requestSource.kind !== 'ai-session' ||
    requestSource.aiSession.expiresAt <= Date.now()
  ) {
    return false
  }

  try {
    return requestSource.aiSession.isActive()
  } catch {
    return false
  }
}

export function hasSourceCapability(requestSource: unknown, capability: TrustedCapability) {
  return (
    isRequestSource(requestSource) &&
    (requestSource.kind === 'main' ||
      (requestSource.kind === 'rpc' && requestSource.participant !== 'dapp')) &&
    requestSource.capabilities.includes(capability)
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
  requestSource: RequestSource,
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
    requestSource: summarizeRequestSource(requestSource)
  })
}

function sourceMayRequest(requestSource: RequestSource, requestType: RequestType) {
  if (requestSource.kind === 'ai-session') {
    return signingRequestTypes.has(requestType)
  }
  if (requestSource.kind !== 'renderer') {
    return true
  }
  if (requestSource.role === 'sidetray') {
    return sideTrayRequestTypes.has(requestType)
  }

  // Wallet UI requests are created by reviewed workflows such as replacement transactions.
  // Access and chain requests originate at the RPC transports, never in the renderer.
  return signingRequestTypes.has(requestType)
}

/**
 * The one policy decision point for account-affecting requests.
 *
 * Ordinary trusted sources require a prompt. A live AI session can act autonomously only for
 * signing requests scoped to its approved account.
 */
export function authorizeGatewayOperation(
  requestSource: unknown,
  request: AccountRequest
): GatewayOperationDecision {
  if (!isRequestSource(requestSource)) {
    return { outcome: 'reject', reason: 'Untrusted request source' }
  }

  const action = buildOperationIntent(requestSource, request)
  if (!action) {
    return { outcome: 'reject', reason: 'Malformed wallet action' }
  }
  if (!sourceMayRequest(requestSource, request.type)) {
    return { outcome: 'reject', reason: 'Request source is not allowed to perform this action' }
  }

  if (requestSource.kind === 'ai-session') {
    if (requestSource.aiSession.expiresAt <= Date.now()) {
      return { outcome: 'reject', reason: 'AI session expired' }
    }
    if (!isAiSessionActive(requestSource)) {
      return { outcome: 'reject', reason: 'AI session is revoked or unavailable' }
    }
    if (action.account !== requestSource.aiSession.accountId) {
      return { outcome: 'reject', reason: 'AI session is not authorized for this account' }
    }

    return {
      outcome: 'autonomous',
      authorization: Object.freeze({
        actionId: action.id,
        decision: 'autonomous' as const,
        decidedAt: Date.now(),
        requestSource: action.requestSource,
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
      requestSource: action.requestSource,
      intent: {
        requestType: action.requestType,
        account: action.account,
        method: action.method
      }
    })
  }
}
