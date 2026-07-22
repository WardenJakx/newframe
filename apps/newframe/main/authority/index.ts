import { randomUUID } from 'node:crypto'

import type { AccountRequest, RequestAuthorization, RequestType } from '../accounts/types'
import type { AuthorizationContext, RendererEntrypoint, RendererRole } from '../ipc/authorization'

const trustedPrincipalBrand = Symbol('newframe.trusted-principal')

type PrincipalBrand = { readonly [trustedPrincipalBrand]: true }

export type RendererPrincipal = PrincipalBrand & {
  readonly kind: 'renderer'
  readonly role: RendererRole
  readonly entrypoint: RendererEntrypoint
  readonly webContentsId: number
  readonly windowInstanceId: string
}

export type TrustedCapability = 'wallet:internal-state'

export type RpcPrincipal = PrincipalBrand & {
  readonly kind: 'rpc'
  readonly transport: 'http' | 'websocket'
  readonly connectionId: string
  readonly origin: string
  readonly capabilities: readonly TrustedCapability[]
}

export type AgentPrincipal = PrincipalBrand & {
  readonly kind: 'agent'
  readonly sessionId: string
  readonly accountId: string
  readonly expiresAt: number
  readonly isActive: () => boolean
}

export type MainPrincipal = PrincipalBrand & {
  readonly kind: 'main'
  readonly component: string
  readonly capabilities: readonly TrustedCapability[]
}

export type TrustedPrincipal = RendererPrincipal | RpcPrincipal | AgentPrincipal | MainPrincipal

export type WalletAction = {
  readonly id: string
  readonly requestType: RequestType
  readonly account: string
  readonly method: string
  readonly principal: RequestAuthorization['principal']
}

export type ActionDecision =
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

function hasTrustedBrand(value: unknown): value is TrustedPrincipal {
  return Boolean(
    value &&
    typeof value === 'object' &&
    (value as Record<PropertyKey, unknown>)[trustedPrincipalBrand] === true
  )
}

function summarizePrincipal(principal: TrustedPrincipal): RequestAuthorization['principal'] {
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
      sessionId: principal.sessionId,
      accountId: principal.accountId,
      expiresAt: principal.expiresAt
    }
  }

  return { kind: 'main', component: principal.component }
}

export function createRendererPrincipal(context: AuthorizationContext): RendererPrincipal {
  return Object.freeze({
    [trustedPrincipalBrand]: true as const,
    kind: 'renderer' as const,
    role: context.clientType,
    entrypoint: context.entrypoint,
    webContentsId: context.webContentsId,
    windowInstanceId: context.windowInstanceId
  })
}

export function createRpcPrincipal(input: {
  transport: RpcPrincipal['transport']
  connectionId: string
  origin: string
  capabilities?: readonly TrustedCapability[]
}): RpcPrincipal {
  return Object.freeze({
    [trustedPrincipalBrand]: true as const,
    kind: 'rpc' as const,
    transport: input.transport,
    connectionId: input.connectionId,
    origin: input.origin,
    capabilities: Object.freeze([...(input.capabilities || [])])
  })
}

export function createAgentPrincipal(input: {
  sessionId: string
  accountId: string
  expiresAt: number
  isActive: () => boolean
}): AgentPrincipal {
  return Object.freeze({
    [trustedPrincipalBrand]: true as const,
    kind: 'agent' as const,
    sessionId: input.sessionId,
    accountId: input.accountId.toLowerCase(),
    expiresAt: input.expiresAt,
    isActive: input.isActive
  })
}

export function isAgentPrincipalActive(principal: unknown): principal is AgentPrincipal {
  if (!hasTrustedBrand(principal) || principal.kind !== 'agent' || principal.expiresAt <= Date.now()) {
    return false
  }

  try {
    return principal.isActive()
  } catch {
    return false
  }
}

export function hasPrincipalCapability(principal: unknown, capability: TrustedCapability) {
  return (
    hasTrustedBrand(principal) &&
    (principal.kind === 'rpc' || principal.kind === 'main') &&
    principal.capabilities.includes(capability)
  )
}

export function createMainPrincipal(
  component: string,
  capabilities: readonly TrustedCapability[] = []
): MainPrincipal {
  return Object.freeze({
    [trustedPrincipalBrand]: true as const,
    kind: 'main' as const,
    component,
    capabilities: Object.freeze([...capabilities])
  })
}

function buildAction(principal: TrustedPrincipal, request: AccountRequest): WalletAction | undefined {
  if (!requestTypes.has(request.type) || !request.account || !request.handlerId || !request.payload?.method) {
    return
  }

  return Object.freeze({
    id: randomUUID(),
    requestType: request.type,
    account: request.account.toLowerCase(),
    method: request.payload.method,
    principal: summarizePrincipal(principal)
  })
}

function principalMayRequest(principal: TrustedPrincipal, requestType: RequestType) {
  if (principal.kind === 'agent') {
    return signingRequestTypes.has(requestType)
  }
  if (principal.kind !== 'renderer') return true
  if (principal.role === 'sidetray') return sideTrayRequestTypes.has(requestType)

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
export function decideWalletAction(principal: unknown, request: AccountRequest): ActionDecision {
  if (!hasTrustedBrand(principal)) return { outcome: 'reject', reason: 'Untrusted request source' }

  const action = buildAction(principal, request)
  if (!action) return { outcome: 'reject', reason: 'Malformed wallet action' }
  if (!principalMayRequest(principal, request.type)) {
    return { outcome: 'reject', reason: 'Request source is not allowed to perform this action' }
  }

  if (principal.kind === 'agent') {
    if (principal.expiresAt <= Date.now()) {
      return { outcome: 'reject', reason: 'Agent session expired' }
    }
    if (!isAgentPrincipalActive(principal)) {
      return { outcome: 'reject', reason: 'Agent session is revoked or unavailable' }
    }
    if (action.account !== principal.accountId) {
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
