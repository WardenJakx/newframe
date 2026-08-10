import { describe, expect, it } from 'bun:test'

import { act, render, screen } from '../../../../test/support/componentSetup'
import { createTestRuntimeFixture } from '../../../../test/support/rendererClient'
import { STATE_STREAM_SCHEMA_VERSION, type StateMessage } from '../contract/protocol'
import { walletChanges, walletState } from './fixtures.test-support.ts'
import { connectRendererState } from './connectState'
import { RendererStateProvider, useWalletSelector } from './useAppSelector'

function Account({ label }: { label: string }) {
  const account = useWalletSelector((state) => state.currentAccount)
  return <output aria-label={label}>{account}</output>
}

describe('renderer runtime isolation', () => {
  it('isolates providers, streams, connections, and command history across concurrent runtimes', async () => {
    const left = createTestRuntimeFixture()
    const right = createTestRuntimeFixture()
    let leftHandler!: (message: StateMessage) => void
    let rightHandler!: (message: StateMessage) => void

    left.client.connectState.mockImplementation(async (handler) => {
      leftHandler = handler
      return { ok: true }
    })
    right.client.connectState.mockImplementation(async (handler) => {
      rightHandler = handler
      return { ok: true }
    })

    const utils = [
      connectRendererState('wallet-ui', left.state, left.client),
      connectRendererState('wallet-ui', right.state, right.client)
    ] as const
    await Promise.resolve()

    leftHandler({
      schemaVersion: STATE_STREAM_SCHEMA_VERSION,
      streamId: 'left-stream',
      revision: 4,
      state: walletState({ currentAccount: 'left-one' })
    })
    rightHandler({
      schemaVersion: STATE_STREAM_SCHEMA_VERSION,
      streamId: 'right-stream',
      revision: 9,
      state: walletState({ currentAccount: 'right-one' })
    })

    const [stopLeft, stopRight] = await Promise.all(utils)
    render(
      <>
        <RendererStateProvider state={left.state}>
          <Account label='left account' />
        </RendererStateProvider>
        <RendererStateProvider state={right.state}>
          <Account label='right account' />
        </RendererStateProvider>
      </>
    )

    expect(screen.getByLabelText('left account').textContent).toBe('left-one')
    expect(screen.getByLabelText('right account').textContent).toBe('right-one')

    act(() => {
      leftHandler({
        schemaVersion: STATE_STREAM_SCHEMA_VERSION,
        streamId: 'left-stream',
        baseRevision: 4,
        revision: 5,
        changes: walletChanges({ currentAccount: 'left-two' })
      })
      rightHandler({
        schemaVersion: STATE_STREAM_SCHEMA_VERSION,
        streamId: 'right-stream',
        baseRevision: 9,
        revision: 10,
        changes: walletChanges({ currentAccount: 'right-two' })
      })
    })

    expect(screen.getByLabelText('left account').textContent).toBe('left-two')
    expect(screen.getByLabelText('right account').textContent).toBe('right-two')
    expect(left.state.getConnectionState()).toEqual({
      activeStream: { streamId: 'left-stream', revision: 5 },
      awaitingSnapshot: false,
      expectedProjection: 'wallet-ui'
    })
    expect(right.state.getConnectionState()).toEqual({
      activeStream: { streamId: 'right-stream', revision: 10 },
      awaitingSnapshot: false,
      expectedProjection: 'wallet-ui'
    })
    expect(left.client.connectState.mock.calls.map(([handler]) => handler)).toEqual([leftHandler])
    expect(right.client.connectState.mock.calls.map(([handler]) => handler)).toEqual([rightHandler])

    await left.client.executeCommand({ type: 'tray.close' })
    await right.client.executeCommand({ type: 'sidetray.close' })
    expect(left.client.executeCommand.mock.calls.map(([command]) => command)).toEqual([
      { type: 'tray.close' }
    ])
    expect(right.client.executeCommand.mock.calls.map(([command]) => command)).toEqual([
      { type: 'sidetray.close' }
    ])

    await Promise.all([stopLeft(), stopRight()])
    expect(left.client.disconnectState.mock.calls).toEqual([[]])
    expect(right.client.disconnectState.mock.calls).toEqual([[]])
  })

  it('fails with an actionable error when no renderer state provider exists', async () => {
    const { render: renderWithoutSupportProvider } = await import('@testing-library/react')

    expect(() => renderWithoutSupportProvider(<Account label='missing' />)).toThrow(
      'Renderer state is unavailable: wrap this renderer root in <RendererStateProvider>.'
    )
  })
})
