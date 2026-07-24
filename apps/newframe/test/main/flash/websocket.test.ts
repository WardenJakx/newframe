import { describe, expect, it, mock } from 'bun:test'
import { EventEmitter } from 'node:events'
import WebSocket from 'ws'

import { FlashOrderStream } from '../../../main/flash/websocket'

class FakeWebSocket extends EventEmitter {
  readyState: number = WebSocket.CONNECTING
  sent: string[] = []

  open() {
    this.readyState = WebSocket.OPEN
    this.emit('open')
  }

  receive(payload: unknown) {
    this.emit('message', Buffer.from(JSON.stringify(payload)))
  }

  send(message: string) {
    this.sent.push(message)
  }

  close() {
    if (this.readyState >= WebSocket.CLOSING) return
    this.readyState = WebSocket.CLOSED
    this.emit('close')
  }
}

describe('Flash order WebSocket stream', () => {
  it('subscribes to orders and heartbeats, then forwards snapshots and updates', async () => {
    const socket = new FakeWebSocket()
    const onOrders = mock()
    const onAvailabilityChange = mock()
    const stream = new FlashOrderStream({
      apiKey: 'dpka_test',
      createSocket: () => socket as unknown as WebSocket,
      funderAddress: '0x0000000000000000000000000000000000000001',
      onAvailabilityChange,
      onOrders,
      url: 'ws://127.0.0.1:8422/v1/ws'
    })

    stream.start()
    socket.open()

    expect(socket.sent.map((message) => JSON.parse(message))).toEqual([
      {
        channel: 'orders',
        type: 'subscribe',
        funderAddress: '0x0000000000000000000000000000000000000001',
        apiKey: 'dpka_test'
      },
      {
        channel: 'heartbeats',
        type: 'subscribe',
        apiKey: 'dpka_test'
      }
    ])

    socket.receive({
      channel: 'subscriptions',
      type: 'ack',
      subscriptions: ['orders', 'heartbeats']
    })
    socket.receive({ channel: 'orders', type: 'snapshot', orders: [{ orderId: 'one' }] })
    socket.receive({ channel: 'orders', type: 'update', orders: [{ orderId: 'two' }] })
    await Bun.sleep(0)

    expect(onAvailabilityChange).toHaveBeenCalledWith(true)
    expect(onOrders).toHaveBeenNthCalledWith(1, 'snapshot', [{ orderId: 'one' }])
    expect(onOrders).toHaveBeenNthCalledWith(2, 'update', [{ orderId: 'two' }])

    stream.stop()
    expect(onAvailabilityChange).toHaveBeenLastCalledWith(false)
  })

  it('stops retrying when Flash rejects the API key', () => {
    const socket = new FakeWebSocket()
    const onAvailabilityChange = mock()
    const onError = mock()
    const stream = new FlashOrderStream({
      apiKey: 'bad-key',
      createSocket: () => socket as unknown as WebSocket,
      funderAddress: '0x0000000000000000000000000000000000000001',
      onAvailabilityChange,
      onError,
      onOrders: mock(),
      url: 'wss://flash.definitive.fi/v1/ws'
    })

    stream.start()
    socket.open()
    socket.receive({ type: 'error', code: 'UNAUTHORIZED', message: 'invalid key' })

    expect(socket.readyState).toBe(WebSocket.CLOSED)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onAvailabilityChange).not.toHaveBeenCalled()
    stream.stop()
  })

  it('reconnects with jittered backoff when streaming is unavailable', async () => {
    const sockets: FakeWebSocket[] = []
    const onAvailabilityChange = mock()
    const stream = new FlashOrderStream({
      apiKey: 'dpka_test',
      createSocket: () => {
        const socket = new FakeWebSocket()
        sockets.push(socket)
        return socket as unknown as WebSocket
      },
      funderAddress: '0x0000000000000000000000000000000000000001',
      onAvailabilityChange,
      onOrders: mock(),
      random: () => 0,
      url: 'wss://flash.definitive.fi/v1/ws'
    })

    stream.start()
    sockets[0].open()
    sockets[0].receive({
      channel: 'subscriptions',
      type: 'ack',
      subscriptions: ['orders', 'heartbeats']
    })
    sockets[0].receive({
      type: 'error',
      code: 'STREAMING_UNAVAILABLE',
      message: 'temporarily unavailable'
    })

    expect(onAvailabilityChange).toHaveBeenNthCalledWith(1, true)
    expect(onAvailabilityChange).toHaveBeenNthCalledWith(2, false)
    await Bun.sleep(550)
    expect(sockets).toHaveLength(2)
    stream.stop()
  })
})
