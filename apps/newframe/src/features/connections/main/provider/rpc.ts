import EventEmitter from 'events'

import type { JsonRpcApiProvider } from 'ethers'
import { FetchRequest, JsonRpcProvider, WebSocketProvider } from 'ethers'
import WebSocket from 'ws'

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function isRpcResponsePayload(value: unknown): value is RpcResult | SubscriptionPayload {
  if (!isRecord(value)) {
    return false
  }
  if (value.method === 'eth_subscription') {
    return (
      value.jsonrpc === '2.0' &&
      isRecord(value.params) &&
      typeof value.params.subscription === 'string' &&
      'result' in value.params
    )
  }
  return (
    (typeof value.id === 'string' || typeof value.id === 'number') &&
    (!value.jsonrpc || value.jsonrpc === '2.0')
  )
}

export type EthersRpcProvider = JsonRpcApiProvider

function normalizeParams(params?: RpcParams) {
  if (Array.isArray(params)) {
    return [...params]
  }
  return params ?? []
}

export function createError(error: RpcResult['error'] | Error | unknown) {
  if (error instanceof Error) {
    return error
  }

  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message)
      : 'JSON-RPC request failed'
  const err = new Error(message) as Error & { code?: number; data?: unknown }

  if (error && typeof error === 'object') {
    if ('code' in error && typeof error.code === 'number') {
      err.code = error.code
    }
    if ('data' in error) {
      err.data = error.data
    }
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
      .catch((error: unknown) => {
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
      const payload: unknown = JSON.parse(message)

      if (isRpcResponsePayload(payload) && 'method' in payload) {
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
        return socket
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
  if (!(provider instanceof WebSocketProvider)) {
    return
  }

  try {
    const socket: unknown = provider.websocket

    if (isRecord(socket) && typeof socket.on === 'function') {
      socket.on('close', onClose)
    } else if (isRecord(socket) && ('onclose' in socket || Object.isExtensible(socket))) {
      const previousClose = socket.onclose
      socket.onclose = (...args: unknown[]) => {
        if (typeof previousClose === 'function') {
          previousClose(...args)
        }
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
  const id = typeof payload.id === 'number' ? payload.id : Number(payload.id)
  if (!Number.isSafeInteger(id)) {
    throw new Error('Invalid JSON-RPC request ID')
  }
  const [response] = await provider._send({
    id,
    jsonrpc: payload.jsonrpc,
    method: payload.method,
    params: normalizeParams(payload.params)
  })

  if ('error' in response) {
    throw createError(response.error)
  }

  return response.result as T
}
