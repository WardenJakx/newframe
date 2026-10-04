import { describe, expect, it } from 'bun:test'

import type { StateMessage } from '@newframe/schema/projection-stream'
import type { SideTrayRendererState } from '@newframe/schema/projections'

import { createTestRuntimeFixture } from '../../../../test/support/rendererClient.ts'
import { connectRendererState } from './connectState.ts'
import { sideTrayState } from './fixtures.test-support.ts'

function createClient() {
  const { client } = createTestRuntimeFixture()
  let handler!: (message: StateMessage) => void
  client.connectState.mockImplementation(async (nextHandler) => {
    handler = nextHandler
    return { ok: true }
  })
  return { client, send: (message: StateMessage) => handler(message) }
}

describe('connectRendererState', () => {
  it('resolves with the snapshot, mirrors updates, and disconnects', async () => {
    const { client, send } = createClient()
    let resolved = false
    const connected = connectRendererState<SideTrayRendererState>(client).then((connection) => {
      resolved = true
      return connection
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(resolved).toBe(false)

    send({ state: sideTrayState({ currentAccount: 'one' }) })
    const { state, disconnect } = await connected
    expect(state.getState().currentAccount).toBe('one')

    send({ changes: { currentAccount: 'two' } })
    expect(state.getState()).toEqual(sideTrayState({ currentAccount: 'two' }))

    send({ state: sideTrayState({ currentAccount: 'three', accountOrder: ['three'] }) })
    expect(state.getState()).toEqual(sideTrayState({ currentAccount: 'three', accountOrder: ['three'] }))

    await disconnect()
    expect(client.disconnectState).toHaveBeenCalledTimes(1)
  })

  it('rejects when main refuses the connection', async () => {
    const { client } = createTestRuntimeFixture()
    client.connectState.mockResolvedValue({ ok: false, error: 'unauthorized' })

    expect(connectRendererState(client)).rejects.toThrow('State connection failed: unauthorized')
  })
})
