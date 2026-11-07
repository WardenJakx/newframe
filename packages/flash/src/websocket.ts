import WebSocket from 'ws'

import { FlashWebSocketFrameSchema } from './wire.ts'

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
// Flash sends a heartbeat every second; a socket silent for this long is treated as dead.
const LIVENESS_TIMEOUT_MS = 15_000
const retryableErrorCodes = new Set([
  'CONNECTION_LIMIT',
  'STREAMING_UNAVAILABLE',
  'SUBSCRIBE_FAILED',
  'SNAPSHOT_FAILED',
  'STREAM_ERROR',
  'INTERNAL_ERROR'
])

export class FlashOrderStream {
  private attempts = 0
  private available = false
  private livenessTimer?: ReturnType<typeof setTimeout>
  private orderQueue = Promise.resolve()
  private reconnectTimer?: ReturnType<typeof setTimeout>
  private socket?: WebSocket
  private stopped = true
  private terminal = false

  constructor(private readonly options: FlashOrderStreamOptions) {}

  start() {
    if (!this.stopped) {
      return
    }

    this.stopped = false
    this.attempts = 0
    this.connect()
  }

  stop() {
    if (this.stopped) {
      return
    }

    this.stopped = true
    clearTimeout(this.livenessTimer)
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
    }
    this.reconnectTimer = undefined
    this.setAvailable(false)

    const socket = this.socket
    this.socket = undefined
    if (socket && socket.readyState < WebSocket.CLOSING) {
      socket.close()
    }
  }

  private connect() {
    if (this.stopped || this.terminal) {
      return
    }

    let socket: WebSocket
    try {
      socket = (this.options.createSocket ?? ((url) => new WebSocket(url)))(this.options.url)
    } catch (error) {
      this.options.onError?.(error)
      this.scheduleReconnect()
      return
    }

    this.socket = socket

    socket.on('open', () => {
      if (this.stopped || socket !== this.socket) {
        return
      }

      this.armLiveness(socket)
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
      if (this.stopped || socket !== this.socket) {
        return
      }

      this.armLiveness(socket)
      try {
        let buffer: Buffer
        if (Array.isArray(message)) {
          buffer = Buffer.concat(message)
        } else if (Buffer.isBuffer(message)) {
          buffer = message
        } else {
          buffer = Buffer.from(message)
        }
        this.handleFrame(JSON.parse(buffer.toString('utf8')))
      } catch (error) {
        this.options.onError?.(error)
      }
    })

    socket.on('error', (error) => {
      this.options.onError?.(error)
    })

    socket.on('close', () => {
      if (socket !== this.socket) {
        return
      }

      this.socket = undefined
      clearTimeout(this.livenessTimer)
      this.setAvailable(false)
      this.scheduleReconnect()
    })
  }

  private handleFrame(value: unknown) {
    const parsed = FlashWebSocketFrameSchema.safeParse(value)
    if (!parsed.success) {
      return
    }
    const frame = parsed.data

    if (frame.type === 'error') {
      const error = new Error(`Flash WebSocket ${frame.code}: ${frame.message}`)
      this.options.onError?.(error)

      if (frame.code === 'UNAUTHORIZED') {
        this.terminal = true
        this.setAvailable(false)
        this.options.onTerminalError?.('UNAUTHORIZED')
        this.socket?.close()
        return
      }

      if (retryableErrorCodes.has(frame.code)) {
        this.setAvailable(false)
        this.socket?.close()
      }
      return
    }

    if (frame.type === 'ack') {
      const subscribed = frame.subscriptions.includes('orders')
      if (subscribed) {
        this.attempts = 0
      }
      this.setAvailable(subscribed)
      return
    }

    const frameType = frame.type
    const orders = frame.orders
    this.orderQueue = this.orderQueue
      .then(() => {
        if (this.stopped) {
          return
        }
        return this.options.onOrders(frameType, orders)
      })
      .then(() => undefined)
      .catch((error: unknown) => this.options.onError?.(error))
  }

  private armLiveness(socket: WebSocket) {
    clearTimeout(this.livenessTimer)
    this.livenessTimer = setTimeout(() => {
      if (socket === this.socket) {
        // terminate() drops a dead connection immediately and still runs the close -> reconnect path.
        socket.terminate()
      }
    }, LIVENESS_TIMEOUT_MS)
  }

  private setAvailable(available: boolean) {
    if (this.available === available) {
      return
    }

    this.available = available
    this.options.onAvailabilityChange?.(available)
  }

  private scheduleReconnect() {
    if (this.stopped || this.terminal || this.reconnectTimer) {
      return
    }

    const backoff = Math.min(RETRY_MAX_MS, RETRY_BASE_MS * 2 ** this.attempts++)
    const random = this.options.random ?? Math.random
    const delay = backoff / 2 + random() * (backoff / 2)

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined
      this.connect()
    }, delay)
  }
}
