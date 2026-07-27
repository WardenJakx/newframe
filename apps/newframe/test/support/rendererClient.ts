import { mock } from 'bun:test'

import type { NewframeHost } from '../../contracts/ipc'
import type { AppCommand, AppQuery, ResultForCommand, ResultForQuery } from '../../contracts/operations'
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
      async <TCommand extends AppCommand>(_command: TCommand): Promise<ResultForCommand<TCommand>> =>
        ({ ok: true }) as ResultForCommand<TCommand>
    ),
    executeQuery: mock(
      async <TQuery extends AppQuery>(_query: TQuery): Promise<ResultForQuery<TQuery>> =>
        ({ ok: false, error: 'not_found' }) as ResultForQuery<TQuery>
    )
  } satisfies NewframeHost
}

export type TestRendererClient = ReturnType<typeof createRendererClient>

export const linkMock = createRendererClient()

export function resetRendererClient(client: TestRendererClient = linkMock) {
  client.connectState.mockReset()
  client.connectState.mockResolvedValue({ ok: true })
  client.disconnectState.mockReset()
  client.disconnectState.mockResolvedValue({ ok: true })
  client.executeCommand.mockReset()
  client.executeCommand.mockResolvedValue({ ok: true })
  client.executeQuery.mockReset()
  client.executeQuery.mockResolvedValue({ ok: false, error: 'not_found' } as never)
}

export function installRendererClient(client: TestRendererClient = linkMock) {
  window.__NEWFRAME_HOST__ = client
  return client
}
