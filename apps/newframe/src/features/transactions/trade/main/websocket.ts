import WebSocket from 'ws'

export type FlashOrderFrameType = 'snapshot' | 'update'
export type FlashWebSocketFactory = (url: string) => WebSocket

export type FlashOrderStreamOptions = {
  apiKey: string
  createSocket?: FlashWebSocketFactory
  funderAddress: string
  onAvailabilityChange?: (available: boolean) => void
  onError?: (error: unknown) => void
  onOrders: (type: FlashOrderFrameType, orders: unknown[]) => void | Promise<void>
  onTerminalError?: (code: string) => void
  random?: () => number
  url: string
}

const RETRY_BASE_MS = 1_000
const RETRY_MAX_MS = 30_000
const retryableErrorCodes = new Set([
  'CONNECTION_LIMIT',
  'STREAMING_UNAVAILABLE',
  'SUBSCRIBE_FAILED',
  'SNAPSHOT_FAILED',
  'STREAM_ERROR',
  'INTERNAL_ERROR'
])

function objectPayload(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {}
}

export class FlashOrderStream {
  private attempts = 0
  private available = false
  private orderQueue = Promise.resolve()
  private reconnectTimer?: ReturnType<typeof setTimeout>
  private socket?: WebSocket
  private stopped = true
  private terminal = false

  constructor(private readonly options: FlashOrderStreamOptions) {}

  start() {
    if (!this.stopped) return

    this.stopped = false
    this.terminal = false
    this.connect()
  }

  stop() {
    if (this.stopped) return

    this.stopped = true
    this.terminal = true
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = undefined
    this.setAvailable(false)

    const socket = this.socket
    this.socket = undefined
    if (socket && socket.readyState < WebSocket.CLOSING) socket.close()
  }

  private connect() {
    if (this.stopped || this.terminal) return

    let socket: WebSocket
    try {
      socket = (this.options.createSocket || ((url) => new WebSocket(url)))(this.options.url)
    } catch (error) {
      this.options.onError?.(error)
      this.scheduleReconnect()
      return
    }

    this.socket = socket

    socket.on('open', () => {
      if (this.stopped || socket !== this.socket) return

      this.attempts = 0
      socket.send(
        JSON.stringify({
          channel: 'orders',
          type: 'subscribe',
          funderAddress: this.options.funderAddress,
          apiKey: this.options.apiKey
        })
      )
      socket.send(
        JSON.stringify({
          channel: 'heartbeats',
          type: 'subscribe',
          apiKey: this.options.apiKey
        })
      )
    })

    socket.on('message', (message) => {
      if (this.stopped || socket !== this.socket) return

      try {
        this.handleFrame(JSON.parse(message.toString()))
      } catch (error) {
        this.options.onError?.(error)
      }
    })

    socket.on('error', (error) => {
      this.options.onError?.(error)
    })

    socket.on('close', () => {
      if (socket !== this.socket) return

      this.socket = undefined
      this.setAvailable(false)
      this.scheduleReconnect()
    })
  }

  private handleFrame(value: unknown) {
    const frame = objectPayload(value)

    if (frame.channel === 'subscriptions' && frame.type === 'ack') {
      const subscriptions = Array.isArray(frame.subscriptions) ? frame.subscriptions : []
      this.setAvailable(subscriptions.includes('orders'))
      return
    }

    if (
      frame.channel === 'orders' &&
      (frame.type === 'snapshot' || frame.type === 'update') &&
      Array.isArray(frame.orders)
    ) {
      this.orderQueue = this.orderQueue
        .then(() => {
          if (this.stopped) return
          return this.options.onOrders(frame.type, frame.orders)
        })
        .then(() => undefined)
        .catch((error) => this.options.onError?.(error))
      return
    }

    if (frame.type !== 'error') return

    const error = new Error(
      `Flash WebSocket ${String(frame.code || 'ERROR')}: ${String(frame.message || '')}`
    )
    this.options.onError?.(error)

    if (frame.code === 'UNAUTHORIZED') {
      this.terminal = true
      this.setAvailable(false)
      this.options.onTerminalError?.('UNAUTHORIZED')
      this.socket?.close()
      return
    }

    if (retryableErrorCodes.has(String(frame.code || ''))) {
      this.setAvailable(false)
      this.socket?.close()
    }
  }

  private setAvailable(available: boolean) {
    if (this.available === available) return

    this.available = available
    this.options.onAvailabilityChange?.(available)
  }

  private scheduleReconnect() {
    if (this.stopped || this.terminal || this.reconnectTimer) return

    const backoff = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** this.attempts++)
    const random = this.options.random || Math.random
    const delay = backoff / 2 + random() * (backoff / 2)

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined
      this.connect()
    }, delay)
  }
}
