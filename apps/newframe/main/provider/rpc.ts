import WebSocket from 'ws'
import EventEmitter from 'events'
import { FetchRequest, JsonRpcApiProvider, JsonRpcProvider, WebSocketProvider } from 'ethers'

export type RpcParams = readonly unknown[] | Record<string, unknown>

export interface ProviderRequest {
  id?: string | number
  jsonrpc?: '2.0'
  method: string
  params?: RpcParams
  chainId?: string
}

export interface ProviderOptions {
  name?: string
  origin?: string
  interval?: number
}

export interface RpcPayload extends ProviderRequest {
  id: string | number
  jsonrpc: '2.0'
  params: RpcParams
}

export interface RpcResult {
  id: string | number
  jsonrpc?: '2.0'
  result?: unknown
  error?: {
    message?: string
    code?: number
    data?: unknown
  }
}

export interface SubscriptionPayload {
  jsonrpc: '2.0'
  method: 'eth_subscription'
  params: {
    subscription: string
    result: unknown
  }
}

export type EthersRpcProvider = JsonRpcApiProvider

function normalizeParams(params?: RpcParams) {
  if (Array.isArray(params)) return [...params]
  return params || []
}

export function createError(error: RpcResult['error'] | Error | unknown) {
  if (error instanceof Error) return error

  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message)
      : 'JSON-RPC request failed'
  const err = new Error(message) as Error & { code?: number; data?: unknown }

  if (error && typeof error === 'object') {
    if ('code' in error && typeof error.code === 'number') err.code = error.code
    if ('data' in error) err.data = error.data
  }

  return err
}

export function withTimeout<T>(promise: Promise<T>, timeout: number, message: string) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeout)

    promise
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch((error) => {
        clearTimeout(timer)
        reject(error)
      })
  })
}

export class FrameWebSocketProvider extends WebSocketProvider {
  private frameEvents = new EventEmitter()

  onFrameSubscription(listener: (payload: SubscriptionPayload) => void) {
    this.frameEvents.on('subscription', listener)
  }

  offFrameSubscription(listener: (payload: SubscriptionPayload) => void) {
    this.frameEvents.off('subscription', listener)
  }

  override async _processMessage(message: string) {
    try {
      const payload = JSON.parse(message) as SubscriptionPayload

      if (payload?.method === 'eth_subscription') {
        this.frameEvents.emit('subscription', payload)
      }
    } catch {
      // The base provider handles malformed messages.
    }

    await super._processMessage(message)
  }

  override async destroy() {
    this.frameEvents.removeAllListeners()
    await super.destroy()
  }
}

export function createJsonRpcProvider(target: string, options: ProviderOptions = {}): EthersRpcProvider {
  const providerOptions = options.interval
    ? { batchMaxCount: 1, pollingInterval: options.interval }
    : { batchMaxCount: 1 }

  if (target.startsWith('ws://') || target.startsWith('wss://')) {
    return new FrameWebSocketProvider(
      () => {
        const socketOptions = options.origin ? { origin: options.origin } : undefined
        const socket = new WebSocket(target, [], socketOptions)
        socket.on('error', () => {})
        return socket as any
      },
      undefined,
      providerOptions
    )
  }

  const request = new FetchRequest(target)
  request.timeout = 60 * 1000

  if (options.origin) {
    request.setHeader('Origin', options.origin)
  }

  return new JsonRpcProvider(request, undefined, providerOptions)
}

export function listenForProviderClose(provider: EthersRpcProvider, onClose: () => void) {
  if (!(provider instanceof WebSocketProvider)) return

  try {
    const socket = provider.websocket as any

    if (typeof socket.on === 'function') {
      socket.on('close', onClose)
    } else {
      const previousClose = socket.onclose
      socket.onclose = (...args: unknown[]) => {
        previousClose?.(...args)
        onClose()
      }
    }
  } catch {
    // If the socket is already closed, the next request will surface the error.
  }
}

export function sendRpcPayload<T = unknown>(provider: EthersRpcProvider, payload: ProviderRequest) {
  return provider.send(payload.method, normalizeParams(payload.params)) as Promise<T>
}

export async function sendRawPayload<T = unknown>(provider: EthersRpcProvider, payload: RpcPayload) {
  const [response] = (await provider._send(payload as any)) as RpcResult[]

  if (response.error) {
    throw createError(response.error)
  }

  return response.result as T
}
