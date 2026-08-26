import { afterEach, beforeEach, describe, expect, it, jest as timers, mock } from 'bun:test'

import FrameBackgroundProvider, { RawFrameConnection } from './frameConnection'

class FakeWebSocket extends EventTarget {
  readyState: number = WebSocket.CONNECTING
  sent: string[] = []

  open() {
    this.readyState = WebSocket.OPEN
    this.dispatchEvent(new Event('open'))
  }

  receive(payload: unknown) {
    this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(payload) }))
  }

  send(payload: string) {
    this.sent.push(payload)
  }

  close() {
    if (this.readyState === WebSocket.CLOSED) return

    this.readyState = WebSocket.CLOSED
    this.dispatchEvent(new Event('close'))
  }
}

const flushPromises = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve()
}

describe('RawFrameConnection reconnects', () => {
  beforeEach(() => timers.useFakeTimers())
  afterEach(() => timers.useRealTimers())

  it('uses exponential backoff and resets it after a successful connection', () => {
    const sockets: FakeWebSocket[] = []
    const connection = new RawFrameConnection('ws://newframe', {
      reconnectInterval: 100,
      maxReconnectInterval: 800,
      createSocket: () => {
        const socket = new FakeWebSocket()
        sockets.push(socket)
        return socket as unknown as WebSocket
      }
    })

    sockets[0]!.close()
    timers.advanceTimersByTime(99)
    expect(sockets).toHaveLength(1)
    timers.advanceTimersByTime(1)
    expect(sockets).toHaveLength(2)

    sockets[1]!.close()
    timers.advanceTimersByTime(199)
    expect(sockets).toHaveLength(2)
    timers.advanceTimersByTime(1)
    expect(sockets).toHaveLength(3)

    sockets[2]!.open()
    sockets[2]!.close()
    timers.advanceTimersByTime(100)
    expect(sockets).toHaveLength(4)

    connection.close()
  })

  it('abandons a socket that stays in CONNECTING', () => {
    const sockets: FakeWebSocket[] = []
    const onError = mock()
    const connection = new RawFrameConnection('ws://newframe', {
      connectionTimeout: 500,
      reconnectInterval: 100,
      createSocket: () => {
        const socket = new FakeWebSocket()
        sockets.push(socket)
        return socket as unknown as WebSocket
      }
    })
    connection.on('error', onError)

    timers.advanceTimersByTime(500)
    expect(sockets[0]!.readyState).toBe(WebSocket.CLOSED)
    expect(onError).toHaveBeenCalledTimes(1)

    timers.advanceTimersByTime(100)
    expect(sockets).toHaveLength(2)

    connection.close()
  })

  it('caps the reconnect delay', () => {
    const sockets: FakeWebSocket[] = []
    const connection = new RawFrameConnection('ws://newframe', {
      reconnectInterval: 100,
      maxReconnectInterval: 200,
      createSocket: () => {
        const socket = new FakeWebSocket()
        sockets.push(socket)
        return socket as unknown as WebSocket
      }
    })

    sockets[0]!.close()
    timers.advanceTimersByTime(100)
    sockets[1]!.close()
    timers.advanceTimersByTime(200)
    sockets[2]!.close()
    timers.advanceTimersByTime(199)
    expect(sockets).toHaveLength(3)
    timers.advanceTimersByTime(1)
    expect(sockets).toHaveLength(4)

    connection.close()
  })
})

describe('FrameBackgroundProvider health check', () => {
  beforeEach(() => timers.useFakeTimers())
  afterEach(() => timers.useRealTimers())

  it('replaces an open socket that stops answering', async () => {
    const sockets: FakeWebSocket[] = []
    const onUnresponsive = mock()
    const provider = new FrameBackgroundProvider('ws://newframe', {
      createSocket: () => {
        const socket = new FakeWebSocket()
        sockets.push(socket)
        return socket as unknown as WebSocket
      }
    })
    provider.on('unresponsive', onUnresponsive)

    sockets[0]!.open()
    const connectionCheck = JSON.parse(sockets[0]!.sent[0]!) as { id: number }
    sockets[0]!.receive({ id: connectionCheck.id, jsonrpc: '2.0', result: '0x1' })
    await flushPromises()
    expect(provider.isConnected()).toBe(true)

    const healthCheck = provider.checkHealth(500)
    timers.advanceTimersByTime(500)
    await flushPromises()

    expect(await healthCheck).toBe(false)
    expect(onUnresponsive).toHaveBeenCalledTimes(1)
    expect(sockets[0]!.readyState).toBe(WebSocket.CLOSED)
    expect(sockets).toHaveLength(2)

    provider.close()
  })
})
