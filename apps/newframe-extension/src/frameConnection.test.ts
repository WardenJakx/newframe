import { afterEach, beforeEach, describe, expect, it, jest as timers, mock } from 'bun:test'

import FrameBackgroundProvider, { RawFrameConnection, type ConnectionRetryState } from './frameConnection'

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

  it('restores a future retry deadline and delay without alarms advancing it', () => {
    const sockets: FakeWebSocket[] = []
    let retryState: ConnectionRetryState | undefined
    const options = {
      createSocket: () => {
        const socket = new FakeWebSocket()
        sockets.push(socket)
        return socket as unknown as WebSocket
      },
      onRetryStateChange: (state: ConnectionRetryState) => {
        retryState = state
      }
    }
    const first = new RawFrameConnection('ws://newframe', options)
    sockets[0]!.close()
    timers.advanceTimersByTime(1000)
    sockets[1]!.close()
    first.close()

    const restored = new RawFrameConnection('ws://newframe', { ...options, retryState })
    restored.ensureConnected()
    restored.reconnect()
    timers.advanceTimersByTime(1999)
    restored.ensureConnected()
    expect(sockets).toHaveLength(2)
    timers.advanceTimersByTime(1)
    restored.ensureConnected()
    expect(sockets).toHaveLength(3)
    sockets[2]!.close()
    timers.advanceTimersByTime(3999)
    expect(sockets).toHaveLength(3)
    timers.advanceTimersByTime(1)
    expect(sockets).toHaveLength(4)
    restored.close()
  })

  it.each([
    { retryAt: Infinity, reconnectDelay: 1000 },
    { retryAt: -1, reconnectDelay: 1000 },
    { retryAt: 0, reconnectDelay: 60_001 },
    { retryAt: 0, reconnectDelay: NaN },
    { retryAt: 'later', reconnectDelay: 1000 }
  ])('ignores invalid persisted retry state %j', (retryState) => {
    const createSocket = mock(() => new FakeWebSocket() as unknown as WebSocket)
    const connection = new RawFrameConnection('ws://newframe', { retryState, createSocket })
    expect(createSocket).toHaveBeenCalledTimes(1)
    connection.close()
  })
})

describe('FrameBackgroundProvider health check', () => {
  beforeEach(() => timers.useFakeTimers())
  afterEach(() => timers.useRealTimers())

  it('backs off handshake errors, timeouts and declines through the 60s cap', async () => {
    const sockets: FakeWebSocket[] = []
    const onRejected = mock()
    const provider = new FrameBackgroundProvider('ws://newframe', {
      requestApproval: true,
      createSocket: () => {
        const socket = new FakeWebSocket()
        sockets.push(socket)
        return socket as unknown as WebSocket
      }
    })
    provider.on('rejected', onRejected)
    const delays = [1000, 2000, 4000, 8000, 16000, 32000, 60000, 60000]
    for (const [i, delay] of delays.entries()) {
      sockets[i]!.open()
      const handshake = JSON.parse(sockets[i]!.sent[0]!) as { id: number; method: string }
      expect(handshake.method).toBe(i === 0 ? 'frame_requestExtensionConnection' : 'eth_chainId')
      if (i === 2) {
        timers.advanceTimersByTime(5000)
      } else {
        sockets[i]!.receive({ id: handshake.id, error: { code: i === 1 ? -1 : 4001 } })
      }
      await flushPromises()
      expect(await provider.checkHealth()).toBe(false)
      provider.connection.ensureConnected()
      expect(sockets[i]!.readyState).toBe(WebSocket.CLOSED)
      expect(sockets[i]!.sent).toHaveLength(1)
      timers.advanceTimersByTime(delay - 1)
      provider.connection.ensureConnected()
      expect(sockets).toHaveLength(i + 1)
      timers.advanceTimersByTime(1)
      provider.connection.ensureConnected()
      expect(sockets).toHaveLength(i + 2)
    }
    expect(onRejected).toHaveBeenCalledTimes(6)

    sockets[8]!.open()
    const handshake = JSON.parse(sockets[8]!.sent[0]!) as { id: number }
    sockets[8]!.receive({ id: handshake.id, result: '0x1' })
    await flushPromises()
    expect(provider.isConnected()).toBe(true)
    sockets[8]!.close()
    timers.advanceTimersByTime(1000)
    expect(sockets).toHaveLength(10)
    provider.close()
  })

  it('starts manual recreation at the initial delay and requests approval once', async () => {
    const sockets: FakeWebSocket[] = []
    const createSocket = () => {
      const socket = new FakeWebSocket()
      sockets.push(socket)
      return socket as unknown as WebSocket
    }
    const previous = new FrameBackgroundProvider('ws://newframe', { createSocket })
    sockets[0]!.close()
    timers.advanceTimersByTime(1000)
    sockets[1]!.close()
    previous.close()
    const provider = new FrameBackgroundProvider('ws://newframe', { createSocket, requestApproval: true })
    sockets[2]!.open()
    const handshake = JSON.parse(sockets[2]!.sent[0]!) as { id: number; method: string }
    expect(handshake.method).toBe('frame_requestExtensionConnection')
    sockets[2]!.receive({ id: handshake.id, error: { code: 4001 } })
    await flushPromises()
    timers.advanceTimersByTime(1000)
    expect(sockets).toHaveLength(4)
    sockets[3]!.open()
    expect(JSON.parse(sockets[3]!.sent[0]!).method).toBe('eth_chainId')
    provider.close()
    await flushPromises()
  })

  it('does not publish a successful handshake after teardown', async () => {
    const socket = new FakeWebSocket()
    const provider = new FrameBackgroundProvider('ws://newframe', {
      createSocket: () => socket as unknown as WebSocket
    })
    const onConnect = mock()
    provider.on('connect', onConnect)
    socket.open()
    const handshake = JSON.parse(socket.sent[0]!) as { id: number }
    socket.receive({ id: handshake.id, result: '0x1' })
    provider.close()
    await flushPromises()
    expect(onConnect).not.toHaveBeenCalled()
    expect(provider.isConnected()).toBe(false)
  })

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
    expect(await provider.checkHealth()).toBe(false)
    provider.connection.ensureConnected()
    timers.advanceTimersByTime(999)
    expect(sockets).toHaveLength(1)
    timers.advanceTimersByTime(1)
    expect(sockets).toHaveLength(2)

    provider.close()
  })
})
