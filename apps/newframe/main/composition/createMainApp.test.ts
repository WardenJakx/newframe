import { expect, it, mock } from 'bun:test'

import { createMainApp } from './createMainApp'

function createTestApp() {
  const ipc = {
    handle: mock(),
    removeHandler: mock()
  }
  const operationDispatcher = {
    dispatchCommand: mock(async () => ({ ok: true })),
    dispatchQuery: mock(async () => ({ ok: true }))
  }
  const unregisterStateStream = mock()
  const stateStream = {
    connectState: mock(() => ({ ok: true })),
    disconnectState: mock(() => ({ ok: true })),
    publishState: mock(),
    registerHandlers: mock(() => unregisterStateStream),
    dispose: mock()
  }

  return {
    app: createMainApp({ ipc, operationDispatcher, stateStream }),
    ipc,
    stateStream,
    unregisterStateStream
  }
}

it('owns IPC registration through an idempotent start/dispose lifecycle', () => {
  const first = createTestApp()
  const second = createTestApp()

  first.app.start()
  first.app.start()
  second.app.start()

  expect(first.app.started).toBe(true)
  expect(first.ipc.handle).toHaveBeenCalledTimes(2)
  expect(first.stateStream.registerHandlers).toHaveBeenCalledTimes(1)
  expect(second.ipc.handle).toHaveBeenCalledTimes(2)

  first.app.dispose()
  first.app.dispose()

  expect(first.app.started).toBe(false)
  expect(first.ipc.removeHandler).toHaveBeenCalledTimes(2)
  expect(first.unregisterStateStream).toHaveBeenCalledTimes(1)
  expect(first.stateStream.dispose).toHaveBeenCalledTimes(1)
  expect(second.app.started).toBe(true)
})

it('rolls back partial handler registration when startup fails', () => {
  const testApp = createTestApp()
  testApp.stateStream.registerHandlers.mockImplementationOnce(() => {
    throw new Error('state stream unavailable')
  })

  expect(() => testApp.app.start()).toThrow('state stream unavailable')
  expect(testApp.app.started).toBe(false)
  expect(testApp.ipc.removeHandler).toHaveBeenCalledTimes(2)
})
