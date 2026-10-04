import { describe, expect, it } from 'bun:test'

import { act, render, screen } from '../../../../test/support/componentSetup.tsx'
import { createTestRuntimeFixture } from '../../../../test/support/rendererClient.ts'
import type { WalletRendererState } from '../contract/projections.ts'
import type { StateMessage } from '../contract/protocol.ts'
import { connectRendererState } from './connectState.ts'
import { walletChanges, walletState } from './fixtures.test-support.ts'
import { RendererStateProvider, useWalletSelector } from './useAppSelector.tsx'

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
  const { state } = await connectRendererState<WalletRendererState>(client)
  return { handler, state }
}

describe('renderer runtime isolation', () => {
  it('isolates providers and streams across concurrent runtimes', async () => {
    const left = await connect('left-one')
    const right = await connect('right-one')

    render(
      <>
        <RendererStateProvider state={{ wallet: left.state }}>
          <Account label='left account' />
        </RendererStateProvider>
        <RendererStateProvider state={{ wallet: right.state }}>
          <Account label='right account' />
        </RendererStateProvider>
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

  it('fails with an actionable error when no renderer state provider exists', async () => {
    const { render: renderWithoutSupportProvider } = await import('@testing-library/react')

    expect(() => renderWithoutSupportProvider(<Account label='missing' />)).toThrow(
      'Renderer state is unavailable: wrap this renderer root in <RendererStateProvider>.'
    )
  })
})
