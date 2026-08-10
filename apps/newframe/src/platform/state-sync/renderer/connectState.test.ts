import { beforeEach, describe, expect, it } from 'bun:test'

import { connectRendererState as connectState } from './connectState'
import { sideTrayState } from './fixtures.test-support.ts'
import { STATE_STREAM_SCHEMA_VERSION, type StateMessage } from '../contract/protocol'
import { registerTestRuntimeFixture } from '../../../../test/support/rendererClient'

const fixture = registerTestRuntimeFixture()

describe('connectRendererState', () => {
  let handler: (message: StateMessage) => void

  beforeEach(() => {
    fixture.state.reset({})
    fixture.client.connectState.mockReset()
    fixture.client.disconnectState.mockReset()
    fixture.client.connectState.mockImplementation(async (nextHandler: (message: StateMessage) => void) => {
      handler = nextHandler
      return { ok: true }
    })
    fixture.client.disconnectState.mockResolvedValue({ ok: true })
  })

  it('does not resolve startup until the authorized stream snapshot arrives', async () => {
    const connected = connectState('sidetray', fixture.state, fixture.client)
    await Promise.resolve()

    expect(fixture.client.connectState).toHaveBeenCalledTimes(1)

    handler({
      schemaVersion: STATE_STREAM_SCHEMA_VERSION,
      streamId: 'initial',
      revision: 0,
      state: sideTrayState()
    })

    const stop = await connected
    await stop()
    expect(fixture.client.disconnectState).toHaveBeenCalledTimes(1)
  })

  it('reconnects with a replacement snapshot after detecting a revision gap', async () => {
    const connected = connectState('sidetray', fixture.state, fixture.client)
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

    expect(fixture.client.disconnectState).toHaveBeenCalledTimes(1)
    expect(fixture.client.connectState).toHaveBeenCalledTimes(2)

    handler({
      schemaVersion: STATE_STREAM_SCHEMA_VERSION,
      streamId: 'replacement',
      revision: 0,
      state: sideTrayState()
    })
    await stop()
  })

  it('reconnects when Electron invalidates the active stream', async () => {
    const connected = connectState('sidetray', fixture.state, fixture.client)
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

    expect(fixture.client.disconnectState).toHaveBeenCalledTimes(1)
    expect(fixture.client.connectState).toHaveBeenCalledTimes(2)
    await stop()
  })

  it('does not reopen a stream when cleanup races an in-flight reconnect', async () => {
    let finishReconnectDisconnect!: (result: { ok: true }) => void
    fixture.client.disconnectState.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finishReconnectDisconnect = resolve
        })
    )

    const connected = connectState('sidetray', fixture.state, fixture.client)
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

    expect(fixture.client.connectState).toHaveBeenCalledTimes(1)
    expect(fixture.client.disconnectState).toHaveBeenCalledTimes(2)
  })
})
