import { beforeEach, describe, expect, it } from 'bun:test'

import { act, render, screen, waitFor } from '../../../../../test/support/componentSetup'
import { registerTestRuntimeFixture } from '../../../../../test/support/rendererClient'
import { NATIVE_CURRENCY } from '../../../../features/tokens/domain/constants'
import { walletState } from '../../../../platform/state-sync/renderer/fixtures.test-support.ts'
import { HomeUiProvider, useHomeUiStore } from './state/HomeUiProvider'
import type { DisplayedBalance } from '../../../../features/asset-data/domain/balance'
import { createRequestRendererCapabilitiesFake as createRequestPortsFake } from '../../../../features/requests/renderer/requestCapabilities.test-support'
import { accountsCapability } from '../../capabilities/accounts'
import { homeCapability } from '../../capabilities/home'
import {
  activityCapability,
  connectionsCapability,
  networksCapability,
  ordersCapability,
  portfolioCapability,
  securityCapability,
  settingsCapability,
  tokensCapability
} from '../../capabilities/homeFeatures'
import type { HomeCapabilities } from './Home'

Object.defineProperty(global.navigator, 'keyboard', {
  configurable: true,
  value: { getLayoutMap: async () => new Map() }
})

const { HomeOverlayRouter } = await import('./HomeOverlayRouter')
const fixture = registerTestRuntimeFixture()
const requestCapabilities = createRequestPortsFake()
const capabilities: HomeCapabilities = {
  accounts: accountsCapability,
  activity: activityCapability,
  connections: connectionsCapability,
  home: homeCapability,
  networks: networksCapability,
  orders: ordersCapability,
  portfolio: portfolioCapability,
  requests: requestCapabilities,
  security: securityCapability,
  settings: settingsCapability,
  tokens: tokensCapability
}

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

function updateWallet(changes: Record<string, unknown>) {
  fixture.state.reset({ ...fixture.state.getState(), ...changes })
}

function Harness() {
  const overlay = useHomeUiStore((state) => state.overlay)
  const openOverlay = useHomeUiStore((state) => state.openOverlay)
  return (
    <>
      <button onClick={() => openOverlay({ type: 'asset', accountId: account.id, asset })}>Open asset</button>
      <button
        onClick={() =>
          openOverlay({
            type: 'addChain',
            pending: { chain: { id: 8453, name: 'Base' }, requestId: 'request-1' }
          })
        }
      >
        Open add chain
      </button>
      <output aria-label='Overlay state'>{overlay.type}</output>
      <HomeOverlayRouter capabilities={capabilities} />
    </>
  )
}

describe('HomeOverlayRouter asset ownership', () => {
  beforeEach(() => {
    fixture.state.reset(
      walletState({
        accounts: { [account.id]: account },
        accountOrder: [account.id],
        currentAccount: account.id
      })
    )
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

describe('HomeOverlayRouter feature navigation', () => {
  beforeEach(() => {
    fixture.state.reset(walletState({}))
  })

  it('translates an approved add-chain outcome into network navigation', async () => {
    const { user } = render(
      <HomeUiProvider>
        <Harness />
      </HomeUiProvider>
    )
    await user.click(screen.getByRole('button', { name: 'Open add chain' }))
    await user.click(screen.getByRole('button', { name: 'Add chain' }))

    expect(screen.getByLabelText('Overlay state').textContent).toBe('networks')
  })

  it('translates a rejected add-chain outcome into closing the overlay', async () => {
    const { user } = render(
      <HomeUiProvider>
        <Harness />
      </HomeUiProvider>
    )
    await user.click(screen.getByRole('button', { name: 'Open add chain' }))
    await user.click(screen.getByRole('button', { name: 'Reject chain' }))

    expect(screen.getByLabelText('Overlay state').textContent).toBe('none')
  })
})
