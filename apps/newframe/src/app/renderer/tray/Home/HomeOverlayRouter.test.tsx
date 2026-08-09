import { beforeEach, describe, expect, it } from 'bun:test'

import { act, render, screen, waitFor } from '../../../../../test/support/componentSetup'
import { STATE_STREAM_SCHEMA_VERSION } from '../../../../platform/state-sync/contract/protocol'
import { NATIVE_CURRENCY } from '../../../../features/tokens/domain/constants'
import { walletState } from '../../../../platform/state-sync/renderer/fixtures.test-support.ts'
import { applyStateMessage, beginStateConnection, resetStateMirrorForTests } from '../../../../platform/state-sync/renderer/rendererStore'
import { HomeUiProvider, useHomeUiStore } from './state/HomeUiProvider'
import type { DisplayedBalance } from '../../../../features/asset-data/domain/balance'

Object.defineProperty(global.navigator, 'keyboard', {
  configurable: true,
  value: { getLayoutMap: async () => new Map() }
})

const { HomeOverlayRouter } = await import('./HomeOverlayRouter')

const account = {
  id: 'account-a',
  profileId: 'default-profile',
  address: '0x0000000000000000000000000000000000000001',
  name: 'Primary',
  lastSignerType: 'address',
  status: 'ok',
  signer: 'watch',
  requests: {},
  created: '2026-01-01T00:00:00.000Z'
}

const asset: DisplayedBalance = {
  address: NATIVE_CURRENCY,
  balance: '1',
  chainId: 1,
  decimals: 18,
  displayBalance: '0.000000000000000001',
  displayValue: '0',
  hasPrice: false,
  name: 'Ether',
  price: '—',
  priceChange: false,
  symbol: 'ETH',
  totalValue: 0
}

let revision = 0

function updateWallet(changes: Record<string, unknown>) {
  const baseRevision = revision
  revision += 1
  applyStateMessage({
    schemaVersion: STATE_STREAM_SCHEMA_VERSION,
    streamId: 'asset-overlay-test',
    baseRevision,
    revision,
    changes
  })
}

function Harness() {
  const overlay = useHomeUiStore((state) => state.overlay)
  const openOverlay = useHomeUiStore((state) => state.openOverlay)
  return (
    <>
      <button onClick={() => openOverlay({ type: 'asset', accountId: account.id, asset })}>Open asset</button>
      <output aria-label='Overlay state'>{overlay.type}</output>
      <HomeOverlayRouter />
    </>
  )
}

describe('HomeOverlayRouter asset ownership', () => {
  beforeEach(() => {
    revision = 0
    resetStateMirrorForTests()
    beginStateConnection('wallet-ui')
    applyStateMessage({
      schemaVersion: STATE_STREAM_SCHEMA_VERSION,
      streamId: 'asset-overlay-test',
      revision,
      state: walletState({
        accounts: { [account.id]: account },
        accountOrder: [account.id],
        currentAccount: account.id
      })
    })
  })

  it('closes an asset overlay when another account becomes current', async () => {
    const { user } = render(
      <HomeUiProvider>
        <Harness />
      </HomeUiProvider>
    )
    await user.click(screen.getByRole('button', { name: 'Open asset' }))
    expect(screen.getByLabelText('Overlay state').textContent).toBe('asset')

    act(() => updateWallet({ currentAccount: 'account-b' }))

    await waitFor(() => expect(screen.getByLabelText('Overlay state').textContent).toBe('none'))
  })

  it('closes when the originating account disappears even if the selected id is stale', async () => {
    const { user } = render(
      <HomeUiProvider>
        <Harness />
      </HomeUiProvider>
    )
    await user.click(screen.getByRole('button', { name: 'Open asset' }))

    act(() => updateWallet({ accounts: {} }))

    await waitFor(() => expect(screen.getByLabelText('Overlay state').textContent).toBe('none'))
  })
})
