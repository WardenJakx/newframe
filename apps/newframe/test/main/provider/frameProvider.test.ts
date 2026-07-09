import EventEmitter from 'events'

const createJsonRpcProviderMock = jest.fn()
const listenForProviderCloseMock = jest.fn()
const sendRawPayloadMock = jest.fn()

class MockProvider extends EventEmitter {
  constructor(readonly target: string) {
    super()
  }

  destroy = jest.fn(async () => {})
}

jest.mock('../../../main/provider/rpc', () => ({
  createError: (error: unknown) => (error instanceof Error ? error : new Error(String(error))),
  createJsonRpcProvider: createJsonRpcProviderMock,
  FrameWebSocketProvider: class FrameWebSocketProvider {},
  listenForProviderClose: listenForProviderCloseMock,
  sendRawPayload: sendRawPayloadMock,
  withTimeout: <T>(promise: Promise<T>) => promise
}))

const flushPromises = async () => {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve()
  }
}

const advanceTimers = async (ms: number) => {
  jest.advanceTimersByTime(ms)
  await flushPromises()
}

describe('FrameProvider reconnect backoff', () => {
  let createFrameProvider: typeof import('../../../main/provider/frameProvider').default
  let closeCallbacks: Array<() => void>

  beforeAll(async () => {
    createFrameProvider = (await import('../../../main/provider/frameProvider')).default
  })

  beforeEach(() => {
    closeCallbacks = []
    createJsonRpcProviderMock.mockImplementation((target: string) => new MockProvider(target))
    listenForProviderCloseMock.mockImplementation((_provider: MockProvider, onClose: () => void) => {
      closeCallbacks.push(onClose)
    })
  })

  it('backs off reconnects after each failed target cycle', async () => {
    sendRawPayloadMock.mockRejectedValue(new Error('offline'))

    const provider = createFrameProvider(['ws://offline', 'http://offline'], { interval: 1000 }) as any

    await advanceTimers(0)

    expect(createJsonRpcProviderMock.mock.calls.map(([target]) => target)).toEqual([
      'ws://offline',
      'http://offline'
    ])

    await advanceTimers(999)
    expect(createJsonRpcProviderMock).toHaveBeenCalledTimes(2)

    await advanceTimers(1)
    expect(createJsonRpcProviderMock.mock.calls.map(([target]) => target)).toEqual([
      'ws://offline',
      'http://offline',
      'ws://offline',
      'http://offline'
    ])

    await advanceTimers(1999)
    expect(createJsonRpcProviderMock).toHaveBeenCalledTimes(4)

    await advanceTimers(1)
    expect(createJsonRpcProviderMock.mock.calls.map(([target]) => target)).toEqual([
      'ws://offline',
      'http://offline',
      'ws://offline',
      'http://offline',
      'ws://offline',
      'http://offline'
    ])

    provider.close()
  })

  it('resets the reconnect delay after a successful connection', async () => {
    sendRawPayloadMock
      .mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce('0x1')
      .mockRejectedValue(new Error('offline'))

    const provider = createFrameProvider(['ws://offline'], { interval: 1000 }) as any

    await advanceTimers(0)
    await advanceTimers(1000)
    await advanceTimers(2000)

    expect(createJsonRpcProviderMock).toHaveBeenCalledTimes(3)
    expect(provider.connected).toBe(true)

    closeCallbacks[2]()

    await advanceTimers(999)
    expect(createJsonRpcProviderMock).toHaveBeenCalledTimes(3)

    await advanceTimers(1)
    expect(createJsonRpcProviderMock).toHaveBeenCalledTimes(4)

    provider.close()
  })
})
