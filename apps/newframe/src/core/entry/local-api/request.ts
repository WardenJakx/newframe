import { isHexString } from '@ethereumjs/util'

import {
  createLocalApiSource,
  type LocalApiSource,
  type RequestSource
} from '../../../app/main/gateway/requestSource.ts'
import type { OriginsService } from '../../../features/connections/main/origins.ts'
import type {
  JSONRPCRequestPayload,
  RPCRequestPayload,
  RPCResponsePayload
} from '../../../shared/domain/rpc.ts'

export interface RpcProviderSendPort {
  send(
    payload: RPCRequestPayload,
    respond?: (response: RPCResponsePayload) => void,
    requestSource?: RequestSource
  ): void | Promise<void>
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
  | 'rate-limited'
  | 'invalid-chain'
  | 'unauthorized-accounts'
  | 'permission-denied'
  | 'internal-error'

interface RpcRequestContext {
  source: LocalApiSource
  payload: RPCRequestPayload
  chainId: string
  respond(response: RPCResponsePayload, reason?: RpcResponseReason): void
}

export interface RpcRequestDescription {
  rawPayload: JSONRPCRequestPayload
  origin: string
  chainHint?: string
  identity: Parameters<typeof createLocalApiSource>[0]
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

const RPC_REQUESTS_PER_SECOND = 20
export const RPC_REQUEST_BURST = 40

export function createRpcRequestHandler({
  provider,
  origins
}: {
  provider: RpcProviderSendPort
  origins: OriginsService
}): RpcRequestHandler {
  let availableRequests = RPC_REQUEST_BURST
  let lastRequest = Date.now()
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
      const now = Date.now()
      availableRequests = Math.min(
        RPC_REQUEST_BURST,
        availableRequests + (Math.max(0, now - lastRequest) * RPC_REQUESTS_PER_SECOND) / 1000
      )
      lastRequest = now
      if (availableRequests < 1) {
        respond(
          {
            id: rawPayload.id,
            jsonrpc: rawPayload.jsonrpc,
            error: { code: -32005, message: 'Rate limit exceeded' }
          },
          'rate-limited'
        )
        return
      }
      availableRequests -= 1

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
      const requestSource: LocalApiSource = createLocalApiSource(request.identity)

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
          source: requestSource,
          respond: (response, reason = 'provider') => respond(response, reason)
        })
      ) {
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

          if (payload.method === 'eth_subscribe' && typeof response.result === 'string') {
            request.onSubscriptionOpen?.(response.result, payload._origin)
          } else if (response.result && payload.method === 'eth_unsubscribe') {
            request.onSubscriptionClose?.(payload.params)
          }

          request.observeProviderResponse?.(response, payload)
          request.writeResponse(response, 'provider')
        },
        requestSource
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
