import { describe, expect, it } from 'bun:test'

import { act, render, screen } from '../../../../test/support/componentSetup.tsx'
import { createTestRuntimeFixture } from '../../../../test/support/trayClient.ts'
import type { MainTrayProjection } from '../contract/projections.ts'
import type { StateMessage } from '../contract/protocol.ts'
import { connectTrayState } from './connectState.ts'
import { walletChanges, walletState } from './fixtures.test-support.ts'
import { TrayStateProvider, useWalletSelector } from './useAppSelector.tsx'

function Account({ label }: { label: string }) {
  const account = useWalletSelector((state) => state.currentAccount)
  return <output aria-label={label}>{account}</output>
}

async function connect(currentAccount: string) {
  const { client } = createTestRuntimeFixture()
  let handler!: (message: StateMessage) => void
  client.connectState.mockImplementation(async (nextHandler) => {
    handler = nextHandler
    nextHandler({ state: walletState({ currentAccount }) })
    return { ok: true }
  })
  const { state } = await connectTrayState<MainTrayProjection>(client)
  return { handler, state }
}

describe('tray runtime isolation', () => {
  it('isolates providers and streams across concurrent runtimes', async () => {
    const left = await connect('left-one')
    const right = await connect('right-one')

    render(
      <>
        <TrayStateProvider state={{ wallet: left.state }}>
          <Account label='left account' />
        </TrayStateProvider>
        <TrayStateProvider state={{ wallet: right.state }}>
          <Account label='right account' />
        </TrayStateProvider>
      </>
    )

    expect(screen.getByLabelText('left account').textContent).toBe('left-one')
    expect(screen.getByLabelText('right account').textContent).toBe('right-one')

    act(() => {
      left.handler({ changes: walletChanges({ currentAccount: 'left-two' }) })
    })

    expect(screen.getByLabelText('left account').textContent).toBe('left-two')
    expect(screen.getByLabelText('right account').textContent).toBe('right-one')
  })

  it('fails with an actionable error when no tray state provider exists', async () => {
    const { render: renderWithoutSupportProvider } = await import('@testing-library/react')

    expect(() => renderWithoutSupportProvider(<Account label='missing' />)).toThrow(
      'Tray state is unavailable: wrap this tray root in <TrayStateProvider>.'
    )
  })
})
