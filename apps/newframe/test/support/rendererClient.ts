import { afterEach, beforeEach, mock } from 'bun:test'

import type { NewframeHost } from '../../contracts/ipc'
import type { AppCommand, AppQuery, CommandResult, ResultForQuery } from '../../contracts/operations'
import type { StateConnectionResult, StateMessage } from '../../contracts/state/protocol'

export function createRendererClient() {
  return {
    connectState: mock(
      async (_handler: (message: StateMessage) => void): Promise<StateConnectionResult> => ({
        ok: true
      })
    ),
    disconnectState: mock(async (): Promise<StateConnectionResult> => ({ ok: true })),
    executeCommand: mock(
      async <TCommand extends AppCommand>(_command: TCommand): Promise<CommandResult> => ({ ok: true })
    ),
    executeQuery: mock(
      async <TQuery extends AppQuery>(_query: TQuery): Promise<ResultForQuery<TQuery>> =>
        ({ ok: false, error: 'not_found' }) as ResultForQuery<TQuery>
    )
  } satisfies NewframeHost
}

export type TestRendererClient = ReturnType<typeof createRendererClient>

export function resetRendererClient(client: TestRendererClient) {
  client.connectState.mockReset()
  client.connectState.mockResolvedValue({ ok: true })
  client.disconnectState.mockReset()
  client.disconnectState.mockResolvedValue({ ok: true })
  client.executeCommand.mockReset()
  client.executeCommand.mockResolvedValue({ ok: true })
  client.executeQuery.mockReset()
  client.executeQuery.mockResolvedValue({ ok: false, error: 'not_found' } as never)
}

export function installRendererClient(client: TestRendererClient) {
  if (typeof window === 'undefined') {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {}
    })
  }

  window.__NEWFRAME_HOST__ = client
  return client
}

export function createHostFixture() {
  const client = createRendererClient()
  let createdWindow = false

  beforeEach(() => {
    createdWindow = typeof window === 'undefined'
    resetRendererClient(client)
    installRendererClient(client)
  })

  afterEach(() => {
    if (createdWindow) {
      Reflect.deleteProperty(globalThis, 'window')
    } else if (window.__NEWFRAME_HOST__ === client) {
      Reflect.deleteProperty(window, '__NEWFRAME_HOST__')
    }
  })

  return client
}
