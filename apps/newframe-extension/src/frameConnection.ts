import EventEmitter from 'events'

import { createDesktopSocket, isDesktopClientError } from '@newframe/desktop-api/client'
import {
  ExtensionRpcResponseSchema,
  type ExtensionRpcPayload as JsonRpcPayload,
  type ExtensionRpcResponse as JsonRpcResponse
} from '@newframe/schema/json-rpc'
export type {
  ExtensionRpcPayload as JsonRpcPayload,
  ExtensionRpcResponse as JsonRpcResponse
} from '@newframe/schema/json-rpc'

import type { ProviderEvent } from '@newframe/schema/local-api'

export interface RawFrameConnectionOptions {
  reconnectInterval?: number
  maxReconnectInterval?: number
  connectionTimeout?: number
  createSocket?: (url: string) => WebSocket
  retryState?: unknown
  onRetryStateChange?: (state: ConnectionRetryState) => void
}

export interface ConnectionRetryState {
  retryAt: number
  reconnectDelay: number
}

const DEFAULT_RECONNECT_INTERVAL = 1000
const DEFAULT_MAX_RECONNECT_INTERVAL = 60_000
const DEFAULT_CONNECTION_TIMEOUT = 10_000
const HEALTH_CHECK_TIMEOUT = 5000

const providerEvents: ProviderEvent[] = [
  'networkChanged',
  'chainChanged',
  'chainsChanged',
  'accountsChanged',
  'assetsChanged'
]

function isJsonRpcResponse(value: unknown): value is JsonRpcResponse {
  return ExtensionRpcResponseSchema.safeParse(value).success
}

async function withTimeout<T>(promise: Promise<T>, timeout: number, message: string) {
  let timer: ReturnType<typeof setTimeout> | undefined

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeout)
      })
    ])
  } finally {
    clearTimeout(timer)
  }
}

class ConnectionRetry {
  private timer?: ReturnType<typeof setTimeout>
  private retryAt = 0
  private delay: number
  private initial: number
  private max: number

  constructor(private options: RawFrameConnectionOptions) {
    this.initial = options.reconnectInterval ?? DEFAULT_RECONNECT_INTERVAL
    this.max = options.maxReconnectInterval ?? DEFAULT_MAX_RECONNECT_INTERVAL
    this.delay = this.initial
    const saved = options.retryState as Partial<ConnectionRetryState> | undefined
    if (
      saved &&
      typeof saved.retryAt === 'number' &&
      Number.isFinite(saved.retryAt) &&
      saved.retryAt >= 0 &&
      saved.retryAt <= Date.now() + this.max &&
      typeof saved.reconnectDelay === 'number' &&
      Number.isFinite(saved.reconnectDelay) &&
      saved.reconnectDelay >= this.initial &&
      saved.reconnectDelay <= this.max
    ) {
      this.retryAt = saved.retryAt
      this.delay = saved.reconnectDelay
    }
  }

  run(connect: () => void) {
    if (this.retryAt > Date.now()) {
      this.timer ??= setTimeout(() => {
        this.timer = undefined
        connect()
      }, this.retryAt - Date.now())
    } else {
      this.close()
      connect()
    }
  }

  backoff() {
    this.retryAt = Date.now() + this.delay
    this.delay = Math.min(this.delay * 2, this.max)
    this.save()
  }

  reset() {
    this.retryAt = 0
    this.delay = this.initial
    this.save()
  }

  close() {
    clearTimeout(this.timer)
    this.timer = undefined
  }

  private save() {
    this.options.onRetryStateChange?.({ retryAt: this.retryAt, reconnectDelay: this.delay })
  }
}

export class RawFrameConnection extends EventEmitter {
  private retry: ConnectionRetry
  private socket?: WebSocket
  private connectionTimer?: ReturnType<typeof setTimeout>
  private queue: JsonRpcPayload[] = []
  private closing = false

  private readonly connectionTimeout: number
  private readonly createSocket: (url: string) => WebSocket

  connected = false
  closed = false

  constructor(
    private url: string,
    options: RawFrameConnectionOptions = {}
  ) {
    super()

    this.retry = new ConnectionRetry(options)
    this.connectionTimeout = options.connectionTimeout ?? DEFAULT_CONNECTION_TIMEOUT
    this.createSocket = options.createSocket ?? ((url) => new WebSocket(url))
    this.ensureConnected()
  }

  send(payload: JsonRpcPayload) {
    const socket = this.socket

    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload))
    } else if (socket?.readyState === WebSocket.CONNECTING) {
      this.queue.push(payload)
    } else {
      this.emitErrorPayload(payload, 'Not connected', 4900)
    }
  }

  close() {
    this.closing = true
    this.retry.close()
    clearTimeout(this.connectionTimer)

    const socket = this.socket
    this.finishDisconnect(socket, false)

    if (socket && socket.readyState < WebSocket.CLOSING) {
      socket.close()
    }
  }

  ensureConnected() {
    if (this.closing || this.connected || this.socket?.readyState === WebSocket.OPEN) {
      return
    }
    if (this.socket?.readyState === WebSocket.CONNECTING) {
      return
    }

    this.retry.run(() => this.connect())
  }

  private connect() {
    if (this.closing) {
      return
    }
    if (this.socket?.readyState === WebSocket.OPEN || this.socket?.readyState === WebSocket.CONNECTING) {
      return
    }

    this.closed = false

    let socket: WebSocket
    try {
      socket = this.createSocket(this.url)
      this.socket = socket
    } catch (e) {
      this.handleError(e)
      this.queueReconnect()
      return
    }

    socket.addEventListener('open', () => this.handleOpen(socket))
    socket.addEventListener('message', (message) => this.handleMessage(socket, message))
    socket.addEventListener('error', (event) => this.handleError(event))
    socket.addEventListener('close', () => this.finishDisconnect(socket))

    clearTimeout(this.connectionTimer)
    this.connectionTimer = setTimeout(() => {
      if (this.socket !== socket || socket.readyState !== WebSocket.CONNECTING) {
        return
      }

      this.handleError(new Error(`WebSocket connection timed out after ${this.connectionTimeout}ms`))
      this.finishDisconnect(socket)
      socket.close()
    }, this.connectionTimeout)
  }

  private handleOpen(socket: WebSocket) {
    if (this.socket !== socket || this.closing) {
      socket.close()
      return
    }

    clearTimeout(this.connectionTimer)
    this.connectionTimer = undefined
    this.retry.reset()
    this.connected = true
    this.emit('connect')
    this.flushQueue()
  }

  private handleMessage(socket: WebSocket, message: MessageEvent) {
    if (this.socket !== socket) {
      return
    }
    if (typeof message.data !== 'string') {
      return
    }

    try {
      const payload: unknown = JSON.parse(message.data)
      const payloads: unknown[] = Array.isArray(payload) ? payload : [payload]

      payloads.forEach((load) => {
        if (isJsonRpcResponse(load)) {
          this.emit('payload', load)
        }
      })
    } catch (e) {
      this.handleError(e)
    }
  }

  private finishDisconnect(socket?: WebSocket, shouldReconnect = true) {
    if (socket && this.socket !== socket) {
      return
    }

    const wasConnected = this.connected || !this.closed

    clearTimeout(this.connectionTimer)
    this.connectionTimer = undefined
    this.connected = false
    this.closed = true
    this.socket = undefined
    this.flushQueueWithError('Not connected', 4900)

    if (wasConnected) {
      this.emit('close')
    }

    if (shouldReconnect && !this.closing) {
      this.queueReconnect()
    }
  }

  private handleError(error: unknown) {
    if (this.listenerCount('error') > 0) {
      this.emit('error', error)
    }
  }

  private queueReconnect() {
    if (this.closing) {
      return
    }

    this.retry.backoff()
    this.ensureConnected()
  }

  private flushQueue() {
    const queued = this.queue
    this.queue = []
    queued.forEach((payload) => this.send(payload))
  }

  private flushQueueWithError(message: string, code: number) {
    const queued = this.queue
    this.queue = []
    queued.forEach((payload) => this.emitErrorPayload(payload, message, code))
  }

  private emitErrorPayload(payload: JsonRpcPayload, message: string, code = -1) {
    this.emit('payload', {
      id: payload.id,
      jsonrpc: payload.jsonrpc,
      error: { message, code }
    })
  }
}

export default class FrameBackgroundProvider extends EventEmitter {
  readonly connection = Object.assign(new EventEmitter(), { ensureConnected: () => this.ensureConnected() })
  nextId = 1
  private transport?: ReturnType<typeof createDesktopSocket>
  private subscription?: { unsubscribe(): void }
  private connectionTimer?: ReturnType<typeof setTimeout>
  private retries: ConnectionRetry
  private connected = false
  private closed = false
  private requestApproval: boolean
  private generation = 0

  constructor(
    private url: string,
    private options: RawFrameConnectionOptions & { requestApproval?: boolean } = {}
  ) {
    super()
    this.requestApproval = options.requestApproval ?? false
    this.retries = new ConnectionRetry(options)
    this.ensureConnected()
  }

  get client() {
    if (!this.transport) {
      throw new Error('Not connected')
    }
    return this.transport.client
  }
  isConnected() {
    return this.connected
  }

  request(payload: JsonRpcPayload) {
    return this.client.rpc.mutate({
      method: payload.method,
      params: payload.params ? [...payload.params] : [],
      chainId: payload.chainId,
      origin: payload.__frameOrigin,
      connecting: payload.__extensionConnecting
    })
  }

  private ensureConnected() {
    if (this.closed || this.transport) {
      return
    }
    this.retries.run(() => this.connect())
  }

  private connect() {
    if (this.closed || this.transport) {
      return
    }
    const generation = ++this.generation
    const url = new URL(this.url)
    url.pathname = '/trpc'
    const createSocket = this.options.createSocket
    const Socket = createSocket
      ? (Object.assign(
          function (url: string) {
            return createSocket(url)
          },
          { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 }
        ) as unknown as typeof WebSocket)
      : undefined
    this.transport = createDesktopSocket({
      url: url.toString(),
      WebSocket: Socket,
      onOpen: () => {
        if (generation !== this.generation) {
          return
        }
        clearTimeout(this.connectionTimer)
        this.connection.emit('connect')
        void this.handshake(generation)
      },
      onClose: () => {
        if (generation === this.generation) {
          this.retry()
        }
      },
      onError: () => {
        if (generation === this.generation) {
          this.retry()
        }
      },
      // Application backoff persists across service-worker restarts and approval failures.
      retryDelayMs: () => this.options.maxReconnectInterval ?? DEFAULT_MAX_RECONNECT_INTERVAL
    })
    this.connectionTimer = setTimeout(
      () => this.retry(),
      this.options.connectionTimeout ?? DEFAULT_CONNECTION_TIMEOUT
    )
  }

  private async timed<T>(call: (signal: AbortSignal) => Promise<T>, timeout: number) {
    const controller = new AbortController()
    try {
      return await withTimeout(call(controller.signal), timeout, 'Newframe connection timed out')
    } finally {
      controller.abort()
    }
  }

  private async handshake(generation: number) {
    const approval = this.requestApproval
    this.requestApproval = false
    try {
      await this.timed(
        (signal) =>
          approval
            ? this.client.extension.connect.mutate({}, { signal })
            : this.client.wallet.chainId.query({}, { signal }),
        HEALTH_CHECK_TIMEOUT
      )
      if (this.closed || generation !== this.generation) {
        return
      }
      this.connected = true
      this.retries.reset()
      this.subscription = this.client.wallet.events.subscribe(
        { events: providerEvents.filter((event) => this.listenerCount(event) > 0) },
        {
          onData: ({ event, value }) =>
            this.emit(
              event,
              event === 'networkChanged' && typeof value === 'string' ? parseInt(value) : value
            ),
          onError: () => {
            if (generation === this.generation) {
              this.retry()
            }
          }
        }
      )
      this.emit('connect')
    } catch (error) {
      if (generation !== this.generation || this.closed) {
        return
      }
      if (isDesktopClientError(error) && error.data?.rpc?.code === 4001) {
        this.emit('rejected')
      }
      this.retry()
    }
  }

  async checkHealth(timeout = HEALTH_CHECK_TIMEOUT) {
    if (!this.connected) {
      return false
    }
    try {
      await this.timed((signal) => this.client.wallet.clientVersion.query({}, { signal }), timeout)
      return true
    } catch {
      if (!this.closed) {
        this.emit('unresponsive')
        this.retry()
      }
      return false
    }
  }

  private stopTransport() {
    ++this.generation
    clearTimeout(this.connectionTimer)
    this.subscription?.unsubscribe()
    this.subscription = undefined
    const transport = this.transport
    this.transport = undefined
    const connected = this.connected
    this.connected = false
    // Close the physical socket to reject in-flight calls before awaiting client shutdown.
    transport?.socket.connection?.ws.close()
    void transport?.socket.close()
    this.connection.emit('close')
    if (connected) {
      this.emit('disconnect')
    }
  }

  private retry() {
    if (this.closed || !this.transport) {
      return
    }
    this.stopTransport()
    this.retries.backoff()
    this.ensureConnected()
  }
  close() {
    this.closed = true
    this.retries.close()
    this.stopTransport()
  }
}
