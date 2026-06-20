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
  __frameInternal?: boolean
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

function createPayload(
  method: string,
  params: JsonRpcParams = [],
  id: number,
  targetChain?: string,
  options: Pick<JsonRpcPayload, '__frameOrigin' | '__extensionConnecting' | '__frameInternal'> = {}
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

  if (options.__frameInternal) {
    payload.__frameInternal = options.__frameInternal
  }

  return payload
}

export class RawFrameConnection extends EventEmitter {
  private socket?: WebSocket
  private reconnectTimer?: ReturnType<typeof setTimeout>
  private queue: JsonRpcPayload[] = []
  private closing = false

  connected = false
  closed = false

  constructor(
    private url: string,
    private interval = 5000
  ) {
    super()

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
    this.closed = true
    clearTimeout(this.reconnectTimer)
    this.flushQueueWithError('Not connected', 4900)

    if (this.socket && this.socket.readyState !== WebSocket.CLOSED) {
      this.socket.close()
    } else {
      this.handleClose()
    }
  }

  private connect() {
    if (this.closing) return

    this.closed = false

    try {
      this.socket = new WebSocket(this.url)
    } catch (e) {
      this.handleError(e)
      this.queueReconnect()
      return
    }

    this.socket.addEventListener('open', () => this.handleOpen())
    this.socket.addEventListener('message', (message) => this.handleMessage(message))
    this.socket.addEventListener('error', (event) => this.handleError(event))
    this.socket.addEventListener('close', () => this.handleClose())
  }

  private handleOpen() {
    this.connected = true
    this.emit('connect')
    this.flushQueue()
  }

  private handleMessage(message: MessageEvent) {
    if (typeof message.data !== 'string') return

    try {
      const payload = JSON.parse(message.data)
      const payloads = Array.isArray(payload) ? payload : [payload]

      payloads.forEach((load) => this.emit('payload', load))
    } catch (e) {
      this.handleError(e)
    }
  }

  private handleClose() {
    const wasConnected = this.connected || !this.closed

    this.connected = false
    this.closed = true
    this.socket = undefined
    this.flushQueueWithError('Not connected', 4900)

    if (wasConnected) {
      this.emit('close')
    }

    if (!this.closing) {
      this.queueReconnect()
    }
  }

  private handleError(error: unknown) {
    if (this.listenerCount('error') > 0) {
      this.emit('error', error)
    }
  }

  private queueReconnect() {
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = setTimeout(() => this.connect(), this.interval)
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

  constructor(url: string) {
    super()

    this.connection = new RawFrameConnection(url)

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

  private async checkConnection() {
    if (this.checkConnectionRunning || this.connected) return

    this.checkConnectionRunning = true

    try {
      await this.doSend('eth_chainId', [], undefined, false)
      this.connected = true
      this.emit('connect')
      this.resumeSubscriptions()
    } catch (e) {
      this.connected = false
    } finally {
      this.checkConnectionRunning = false
    }
  }

  private doSend<T = unknown>(
    method: string,
    params: JsonRpcParams = [],
    targetChain?: string,
    waitForConnection = true,
    options: Pick<JsonRpcPayload, '__frameOrigin' | '__extensionConnecting' | '__frameInternal'> = {}
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
