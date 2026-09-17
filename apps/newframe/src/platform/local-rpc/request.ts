import { isHexString } from '@ethereumjs/util'

import {
  createRpcPrincipal,
  type RpcPrincipal,
  type TrustedPrincipal
} from '../../features/access-control/main/authority.js'
import type { OriginsService } from '../../features/connections/main/origins.js'
import protectedMethods from './protectedMethods.js'

export interface RpcProviderSendPort {
  send(
    payload: RPCRequestPayload,
    respond?: (response: RPCResponsePayload) => void,
    principal?: TrustedPrincipal
  ): void | Promise<void>
}

interface RpcAccountsPort {
  getSelectedAddresses(): string[]
}

interface OriginSessionStorePort {
  endOriginSession(originId: string): void
}

export interface ApiTimerPort {
  setTimeout(task: () => void, delayMs: number): ReturnType<typeof setTimeout>
  clearTimeout(timer: ReturnType<typeof setTimeout>): void
}

const systemTimers: ApiTimerPort = {
  setTimeout: (task, delayMs) => setTimeout(task, delayMs),
  clearTimeout: (timer) => clearTimeout(timer)
}

export function createOriginSessionMonitor({
  store,
  timers = systemTimers
}: {
  store: OriginSessionStorePort
  timers?: ApiTimerPort
}) {
  const monitors: Record<string, ReturnType<typeof setTimeout>> = {}
  let disposed = false

  return {
    extend(originId: string) {
      if (disposed || !originId) {
        return
      }

      if (Object.hasOwn(monitors, originId)) {
        timers.clearTimeout(monitors[originId])
      }
      monitors[originId] = timers.setTimeout(() => {
        delete monitors[originId]
        store.endOriginSession(originId)
      }, 60_000)
    },
    dispose() {
      if (disposed) {
        return
      }
      disposed = true
      Object.values(monitors).forEach((timer) => timers.clearTimeout(timer))
      Object.keys(monitors).forEach((originId) => delete monitors[originId])
    }
  }
}

type OriginSessionMonitor = ReturnType<typeof createOriginSessionMonitor>

export type RpcResponseReason =
  | 'provider'
  | 'invalid-chain'
  | 'unauthorized-accounts'
  | 'permission-denied'
  | 'internal-error'

interface RpcRequestContext {
  payload: RPCRequestPayload
  chainId: string
  respond(response: RPCResponsePayload, reason?: RpcResponseReason): void
}

export interface RpcRequestDescription {
  rawPayload: JSONRPCRequestPayload
  origin: string
  chainHint?: string
  identity: Parameters<typeof createRpcPrincipal>[0]
  updateOrigin?: {
    connectionMessage?: boolean
    faviconSource?: string
  }
  session: {
    monitor: OriginSessionMonitor
    refresh: 'before-validation' | 'after-validation' | 'omit'
  }
  acceptsProviderResponse(): boolean
  writeResponse(response: RPCResponsePayload, reason: RpcResponseReason): void
  postValidationInterceptor?(context: RpcRequestContext): boolean | Promise<boolean>
  observeProviderResponse?(response: RPCResponsePayload, payload: RPCRequestPayload): void
  onSubscriptionOpen?(subscriptionId: string, originId: string): void
  onSubscriptionClose?(subscriptionIds: readonly unknown[]): void
  onError?(error: unknown): void
}

export interface RpcRequestHandler {
  (request: RpcRequestDescription): Promise<void>
}

export function createRpcRequestHandler({
  provider,
  accounts,
  origins
}: {
  provider: RpcProviderSendPort
  accounts: RpcAccountsPort
  origins: OriginsService
}): RpcRequestHandler {
  return async (request) => {
    const { rawPayload } = request
    let settled = false
    const respond = (response: RPCResponsePayload, reason: RpcResponseReason) => {
      if (settled) {
        return
      }
      settled = true
      request.writeResponse(response, reason)
    }

    try {
      if (request.chainHint && !rawPayload.chainId) {
        rawPayload.chainId = request.chainHint
      }

      const { connectionMessage = false, faviconSource } = request.updateOrigin ?? {}
      const { payload, chainId } = origins.updateOrigin(
        rawPayload,
        request.origin,
        connectionMessage,
        faviconSource
      )
      const principal: RpcPrincipal = createRpcPrincipal(request.identity)

      if (request.session.refresh === 'before-validation') {
        request.session.monitor.extend(payload._origin)
      }

      if (!isHexString(chainId)) {
        respond(
          {
            id: rawPayload.id,
            jsonrpc: rawPayload.jsonrpc,
            error: {
              message: `Invalid chain id (${rawPayload.chainId}), chain id must be hex-prefixed string`,
              code: -1
            }
          },
          'invalid-chain'
        )
        return
      }

      if (request.session.refresh === 'after-validation') {
        request.session.monitor.extend(payload._origin)
      }

      if (
        await request.postValidationInterceptor?.({
          payload,
          chainId,
          respond: (response, reason = 'provider') => respond(response, reason)
        })
      ) {
        return
      }

      if (protectedMethods.includes(payload.method) && !(await origins.isTrusted(payload, principal))) {
        if (payload.method === 'eth_accounts') {
          respond({ id: payload.id, jsonrpc: payload.jsonrpc, result: [] }, 'unauthorized-accounts')
          return
        }

        respond(
          {
            id: payload.id,
            jsonrpc: payload.jsonrpc,
            error: {
              message: accounts.getSelectedAddresses()[0]
                ? `Permission denied, approve ${request.origin} in Newframe to continue`
                : 'No Newframe account selected',
              code: 4001
            }
          },
          'permission-denied'
        )
        return
      }

      await provider.send(
        payload,
        (response) => {
          if (settled) {
            return
          }
          settled = true
          if (!request.acceptsProviderResponse()) {
            return
          }

          if (response.result) {
            if (payload.method === 'eth_subscribe') {
              request.onSubscriptionOpen?.(String(response.result), payload._origin)
            } else if (payload.method === 'eth_unsubscribe') {
              request.onSubscriptionClose?.(payload.params)
            }
          }

          request.observeProviderResponse?.(response, payload)
          request.writeResponse(response, 'provider')
        },
        principal
      )
    } catch (error) {
      request.onError?.(error)
      respond(
        {
          id: rawPayload.id,
          jsonrpc: rawPayload.jsonrpc,
          error: { code: -32603, message: 'Internal error' }
        },
        'internal-error'
      )
    }
  }
}
