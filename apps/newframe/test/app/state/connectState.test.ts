import { beforeEach, describe, expect, it, mock } from 'bun:test'

import { connectRendererState as connectState } from '../../../app/state/connectState'
import { resetStateMirrorForTests } from '../../../app/state/rendererStore'
import { projectSideTrayState } from '../../../main/state/projections'
import createInitialState from '../../../main/store/state'
import link from '../../../resources/link'
import { STATE_STREAM_SCHEMA_VERSION, type StateMessage } from '../../../resources/state/protocol'

const connection = link.connectState as ReturnType<typeof mock>
const disconnect = link.disconnectState as ReturnType<typeof mock>
const sideTrayState = () => projectSideTrayState(createInitialState())

describe('connectRendererState', () => {
  let handler: (message: StateMessage) => void

  beforeEach(() => {
    resetStateMirrorForTests()
    connection.mockReset()
    disconnect.mockReset()
    connection.mockImplementation(async (nextHandler: (message: StateMessage) => void) => {
      handler = nextHandler
      return { ok: true }
    })
    disconnect.mockResolvedValue({ ok: true })
  })

  it('does not resolve startup until the authorized stream snapshot arrives', async () => {
    const connected = connectState('sidetray')
    await Promise.resolve()

    expect(connection).toHaveBeenCalledTimes(1)

    handler({
      schemaVersion: STATE_STREAM_SCHEMA_VERSION,
      streamId: 'initial',
      revision: 0,
      state: sideTrayState()
    })

    const stop = await connected
    await stop()
    expect(disconnect).toHaveBeenCalledTimes(1)
  })

  it('reconnects with a replacement snapshot after detecting a revision gap', async () => {
    const connected = connectState('sidetray')
    await Promise.resolve()
    handler({
      schemaVersion: STATE_STREAM_SCHEMA_VERSION,
      streamId: 'initial',
      revision: 0,
      state: sideTrayState()
    })
    const stop = await connected

    handler({
      schemaVersion: STATE_STREAM_SCHEMA_VERSION,
      streamId: 'initial',
      baseRevision: 2,
      revision: 3,
      changes: { currentAccount: '' }
    })
    await Promise.resolve()
    await Promise.resolve()

    expect(disconnect).toHaveBeenCalledTimes(1)
    expect(connection).toHaveBeenCalledTimes(2)

    handler({
      schemaVersion: STATE_STREAM_SCHEMA_VERSION,
      streamId: 'replacement',
      revision: 0,
      state: sideTrayState()
    })
    await stop()
  })

  it('reconnects when Electron invalidates the active stream', async () => {
    const connected = connectState('sidetray')
    await Promise.resolve()
    handler({
      schemaVersion: STATE_STREAM_SCHEMA_VERSION,
      streamId: 'initial',
      revision: 0,
      state: sideTrayState()
    })
    const stop = await connected

    handler({
      schemaVersion: STATE_STREAM_SCHEMA_VERSION,
      streamId: 'initial',
      type: 'stream-invalidated'
    })
    await Promise.resolve()
    await Promise.resolve()

    expect(disconnect).toHaveBeenCalledTimes(1)
    expect(connection).toHaveBeenCalledTimes(2)
    await stop()
  })

  it('does not reopen a stream when cleanup races an in-flight reconnect', async () => {
    let finishReconnectDisconnect!: (result: { ok: true }) => void
    disconnect.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishReconnectDisconnect = resolve
        })
    )

    const connected = connectState('sidetray')
    await Promise.resolve()
    handler({
      schemaVersion: STATE_STREAM_SCHEMA_VERSION,
      streamId: 'initial',
      revision: 0,
      state: sideTrayState()
    })
    const stop = await connected

    handler({
      schemaVersion: STATE_STREAM_SCHEMA_VERSION,
      streamId: 'initial',
      baseRevision: 2,
      revision: 3,
      changes: { currentAccount: '' }
    })
    await Promise.resolve()

    const stopped = stop()
    finishReconnectDisconnect({ ok: true })
    await stopped
    await Promise.resolve()

    expect(connection).toHaveBeenCalledTimes(1)
    expect(disconnect).toHaveBeenCalledTimes(2)
  })
})
