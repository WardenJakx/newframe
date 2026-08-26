import EventEmitter from 'events'

type JsonRpcParams = readonly unknown[]

export interface JsonRpcPayload {
  id?: number | string
  jsonrpc?: '2.0'
  method: string
  params?: JsonRpcParams
  chainId?: string
  __frameOrigin?: string
  __extensionConnecting?: boolean
}

interface JsonRpcResponse {
  id?: number | string
  jsonrpc?: '2.0'
  result?: unknown
  error?: unknown
  method?: string
  params?: {
    subscription: string
    result: unknown
  }
}

interface PendingRequest {
  method: string
  resolve: (value: unknown) => void
  reject: (error: unknown) => void
}

type ProviderEvent = 'networkChanged' | 'chainChanged' | 'chainsChanged' | 'accountsChanged' | 'assetsChanged'

export interface RawFrameConnectionOptions {
  reconnectInterval?: number
  maxReconnectInterval?: number
  connectionTimeout?: number
  createSocket?: (url: string) => WebSocket
}

const DEFAULT_RECONNECT_INTERVAL = 1000
const DEFAULT_MAX_RECONNECT_INTERVAL = 30_000
const DEFAULT_CONNECTION_TIMEOUT = 10_000
const HEALTH_CHECK_TIMEOUT = 5000

const providerEvents: ProviderEvent[] = [
  'networkChanged',
  'chainChanged',
  'chainsChanged',
  'accountsChanged',
  'assetsChanged'
]

function normalizeParams(params?: JsonRpcParams) {
  return params ? [...params] : []
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

function createPayload(
  method: string,
  params: JsonRpcParams = [],
  id: number,
  targetChain?: string,
  options: Pick<JsonRpcPayload, '__frameOrigin' | '__extensionConnecting'> = {}
) {
  const payload: JsonRpcPayload = { id, method, params, jsonrpc: '2.0' }

  if (targetChain) {
    payload.chainId = targetChain
  }

  if (options.__frameOrigin) {
    payload.__frameOrigin = options.__frameOrigin
  }

  if (options.__extensionConnecting) {
    payload.__extensionConnecting = options.__extensionConnecting
  }

  return payload
}

export class RawFrameConnection extends EventEmitter {
  private socket?: WebSocket
  private reconnectTimer?: ReturnType<typeof setTimeout>
  private connectionTimer?: ReturnType<typeof setTimeout>
  private queue: JsonRpcPayload[] = []
  private closing = false
  private reconnectDelay: number

  private readonly reconnectInterval: number
  private readonly maxReconnectInterval: number
  private readonly connectionTimeout: number
  private readonly createSocket: (url: string) => WebSocket

  connected = false
  closed = false

  constructor(
    private url: string,
    options: RawFrameConnectionOptions = {}
  ) {
    super()

    this.reconnectInterval = options.reconnectInterval ?? DEFAULT_RECONNECT_INTERVAL
    this.maxReconnectInterval = options.maxReconnectInterval ?? DEFAULT_MAX_RECONNECT_INTERVAL
    this.connectionTimeout = options.connectionTimeout ?? DEFAULT_CONNECTION_TIMEOUT
    this.createSocket = options.createSocket ?? ((url) => new WebSocket(url))
    this.reconnectDelay = this.reconnectInterval

    this.connect()
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
    clearTimeout(this.reconnectTimer)
    clearTimeout(this.connectionTimer)

    const socket = this.socket
    this.finishDisconnect(socket, false)

    if (socket && socket.readyState < WebSocket.CLOSING) {
      socket.close()
    }
  }

  ensureConnected() {
    if (this.closing || this.connected || this.socket?.readyState === WebSocket.OPEN) return
    if (this.socket?.readyState === WebSocket.CONNECTING) return

    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = undefined
    this.connect()
  }

  reconnect() {
    if (this.closing) return

    clearTimeout(this.reconnectTimer)
    clearTimeout(this.connectionTimer)
    this.reconnectTimer = undefined
    this.connectionTimer = undefined

    const socket = this.socket
    this.finishDisconnect(socket, false)

    if (socket && socket.readyState < WebSocket.CLOSING) {
      socket.close()
    }

    this.connect()
  }

  private connect() {
    if (this.closing) return
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
      if (this.socket !== socket || socket.readyState !== WebSocket.CONNECTING) return

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
    this.reconnectDelay = this.reconnectInterval
    this.connected = true
    this.emit('connect')
    this.flushQueue()
  }

  private handleMessage(socket: WebSocket, message: MessageEvent) {
    if (this.socket !== socket) return
    if (typeof message.data !== 'string') return

    try {
      const payload = JSON.parse(message.data)
      const payloads = Array.isArray(payload) ? payload : [payload]

      payloads.forEach((load) => this.emit('payload', load))
    } catch (e) {
      this.handleError(e)
    }
  }

  private finishDisconnect(socket?: WebSocket, shouldReconnect = true) {
    if (socket && this.socket !== socket) return

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
    if (this.closing || this.reconnectTimer) return

    const delay = this.reconnectDelay
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectInterval)
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined
      this.connect()
    }, delay)
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
  connection: RawFrameConnection
  nextId = 1

  private promises: Record<number, PendingRequest> = {}
  private attemptedSubscriptions = new Set<ProviderEvent>()
  private subscriptionEvents = new Map<string, ProviderEvent>()
  private checkConnectionRunning = false
  private connected = false

  constructor(url: string, connectionOptions?: RawFrameConnectionOptions) {
    super()

    this.connection = new RawFrameConnection(url, connectionOptions)

    this.connection.on('connect', () => this.checkConnection())
    this.connection.on('close', () => this.handleClose())
    this.connection.on('payload', (payload) => this.handlePayload(payload))
    this.on('newListener', (event) => this.handleNewListener(event))
  }

  request<T = unknown>(payload: JsonRpcPayload) {
    return this.doSend<T>(payload.method, payload.params, payload.chainId, true, payload)
  }

  send<T = unknown>(payload: JsonRpcPayload) {
    return this.request<T>(payload)
  }

  close() {
    this.connection.close()
    this.connected = false
    this.rejectPending(new Error('Not connected'))
  }

  isConnected() {
    return this.connected
  }

  async checkHealth(timeout = HEALTH_CHECK_TIMEOUT) {
    if (!this.connected) {
      this.connection.ensureConnected()
      return false
    }

    try {
      await withTimeout(
        this.doSend('web3_clientVersion', [], undefined, false),
        timeout,
        'Newframe connection health check timed out'
      )
      return true
    } catch {
      if (this.connection.connected) {
        this.emit('unresponsive')
        this.connection.reconnect()
      }
      return false
    }
  }

  private async checkConnection() {
    if (this.checkConnectionRunning || this.connected) return

    this.checkConnectionRunning = true

    try {
      await withTimeout(
        this.doSend('eth_chainId', [], undefined, false),
        HEALTH_CHECK_TIMEOUT,
        'Newframe connection handshake timed out'
      )
      this.connected = true
      this.emit('connect')
      this.resumeSubscriptions()
    } catch (e) {
      this.connected = false
      if (this.connection.connected) this.connection.reconnect()
    } finally {
      this.checkConnectionRunning = false
    }
  }

  private doSend<T = unknown>(
    method: string,
    params: JsonRpcParams = [],
    targetChain?: string,
    waitForConnection = true,
    options: Pick<JsonRpcPayload, '__frameOrigin' | '__extensionConnecting'> = {}
  ) {
    const send = () =>
      new Promise<T>((resolve, reject) => {
        try {
          const payload = createPayload(method, normalizeParams(params), this.nextId++, targetChain, options)
          this.promises[payload.id as number] = {
            method,
            resolve: (value) => resolve(value as T),
            reject
          }
          this.connection.send(payload)
        } catch (e) {
          reject(e)
        }
      })

    if (this.connected || !waitForConnection) {
      return send()
    }

    return new Promise<T>((resolve, reject) => {
      const resolveSend = () => {
        clearTimeout(disconnectTimer)
        send().then(resolve, reject)
      }
      const disconnectTimer = setTimeout(() => {
        this.off('connect', resolveSend)
        reject(new Error('Not connected'))
      }, 5000)

      this.once('connect', resolveSend)
    })
  }

  private handlePayload(payload: JsonRpcResponse) {
    if (typeof payload.id !== 'undefined') {
      const pending = this.promises[payload.id as number]
      if (!pending) return

      delete this.promises[payload.id as number]
      if (payload.error) {
        pending.reject(payload.error)
      } else {
        pending.resolve(payload.result)
      }
      return
    }

    if (!payload.method?.includes('_subscription') || !payload.params) return

    const event = this.subscriptionEvents.get(payload.params.subscription)
    if (!event) return

    this.handleProviderEvent(event, payload.params.result)
  }

  private handleClose() {
    const wasConnected = this.connected

    this.connected = false
    this.attemptedSubscriptions.clear()
    this.subscriptionEvents.clear()
    this.rejectPending(new Error('Not connected'))

    if (wasConnected) {
      this.emit('disconnect')
    }
  }

  private handleNewListener(event: string | symbol) {
    if (!this.isProviderEvent(event) || this.attemptedSubscriptions.has(event)) return
    if (this.connected) this.startProviderSubscription(event)
  }

  private async startProviderSubscription(event: ProviderEvent) {
    this.attemptedSubscriptions.add(event)

    try {
      const subId = await this.doSend<string>('eth_subscribe', [event])
      this.subscriptionEvents.set(subId, event)
    } catch (e) {
      console.warn(`Unable to subscribe to ${event}`, e)
    }
  }

  private resumeSubscriptions() {
    providerEvents.forEach((event) => {
      if (this.listenerCount(event) && !this.attemptedSubscriptions.has(event)) {
        this.startProviderSubscription(event)
      }
    })
  }

  private handleProviderEvent(event: ProviderEvent, result: unknown) {
    if (event === 'networkChanged') {
      this.emit('networkChanged', typeof result === 'string' ? parseInt(result) : result)
    } else {
      this.emit(event, result)
    }
  }

  private rejectPending(error: Error) {
    const pending = this.promises
    this.promises = {}

    Object.values(pending).forEach(({ reject }) => reject(error))
  }

  private isProviderEvent(event: string | symbol): event is ProviderEvent {
    return typeof event === 'string' && providerEvents.includes(event as ProviderEvent)
  }
}
