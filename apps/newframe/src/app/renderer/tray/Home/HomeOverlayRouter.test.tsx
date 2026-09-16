import { beforeEach, describe, expect, it } from 'bun:test'

import { act, fireEvent, render, screen, waitFor, within } from '../../../../../test/support/componentSetup'
import { registerTestRuntimeFixture } from '../../../../../test/support/rendererClient'
import type { DisplayedBalance } from '../../../../features/asset-data/domain/balance'
import { createRequestRendererCapabilitiesFake as createRequestPortsFake } from '../../../../features/requests/renderer/requestCapabilities.test-support'
import { NATIVE_CURRENCY } from '../../../../features/tokens/domain/constants'
import { walletState } from '../../../../platform/state-sync/renderer/fixtures.test-support.ts'
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
import { HomeUiProvider, useHomeUiStore } from './state/HomeUiProvider'

Object.defineProperty(global.navigator, 'keyboard', {
  configurable: true,
  value: { getLayoutMap: async () => new Map() }
})

const { HomeOverlayRouter } = await import('./HomeOverlayRouter')
const { default: Home } = await import('./Home')
const fixture = registerTestRuntimeFixture()
const requestCapabilities = createRequestPortsFake()
const capabilities: HomeCapabilities = {
  camera: createQrCameraFake().camera,
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

describe('HomeOverlayRouter retained menu layers', () => {
  beforeEach(() => fixture.state.reset(walletState({})))

  for (const label of ['Settings', 'App Info', 'Dapps', 'Custom Tokens']) {
    it(`retains Home and Menu identity, scroll and focus through ${label}`, async () => {
      const { user } = render(<Home capabilities={capabilities} />)
      const homeTrigger = screen.getByRole('button', { name: 'Main menu' })
      await user.click(homeTrigger)
      const menu = screen.getByRole('dialog', { name: 'Main menu' })
      const menuLayer = menu.parentElement!
      const scroll = menu.lastElementChild!
      scroll.scrollTop = 120
      const pageTrigger = within(menu).getByRole('button', { name: label })

      await user.click(pageTrigger)

      const page = screen.getByRole('dialog', { name: label })
      expect(menu.isConnected).toBe(true)
      expect(menuLayer.hasAttribute('inert')).toBe(true)
      expect(menuLayer.getAttribute('aria-hidden')).toBe('true')
      expect(homeTrigger.closest('[inert]')?.getAttribute('aria-hidden')).toBe('true')
      expect(document.activeElement).toBe(within(page).getByRole('button', { name: 'Back' }))
      expect(page.parentElement!.hasAttribute('inert')).toBe(false)

      await user.click(within(page).getByRole('button', { name: 'Back' }))

      expect(screen.getByRole('dialog', { name: 'Main menu' })).toBe(menu)
      expect(menuLayer.hasAttribute('inert')).toBe(false)
      expect(menuLayer.hasAttribute('aria-hidden')).toBe(false)
      expect(scroll.scrollTop).toBe(120)
      expect(document.activeElement).toBe(pageTrigger)
      expect(homeTrigger.closest('[inert]')).not.toBeNull()

      await user.click(within(menu).getByRole('button', { name: 'Close menu' }))

      expect(screen.getByRole('button', { name: 'Main menu' })).toBe(homeTrigger)
      expect(homeTrigger.closest('[inert]')).toBeNull()
      expect(document.activeElement).toBe(homeTrigger)
    })
  }

  it('contains Tab and closes only the active page on Escape, respecting child cancellation', async () => {
    const { user } = render(<Home capabilities={capabilities} />)
    await user.click(screen.getByRole('button', { name: 'Main menu' }))
    const menu = screen.getByRole('dialog', { name: 'Main menu' })
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(within(menu).getByRole('button', { name: 'Quit' }))
    await user.tab()
    expect(document.activeElement).toBe(within(menu).getByRole('button', { name: 'Close menu' }))

    await user.click(within(menu).getByRole('button', { name: 'App Info' }))
    const page = screen.getByRole('dialog', { name: 'App Info' })
    const buttons = within(page).getAllByRole('button')
    await user.tab({ shift: true })
    expect(document.activeElement).toBe(buttons.at(-1)!)
    await user.tab()
    expect(document.activeElement).toBe(buttons[0])

    const cancelEscape = (event: Event) => event.preventDefault()
    buttons[0].addEventListener('keydown', cancelEscape, { once: true })
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog', { name: 'App Info' })).toBe(page)
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog', { name: 'Main menu' })).toBe(menu)
    expect(screen.queryByRole('dialog', { name: 'App Info' })).toBeNull()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('retains the Tokens page beneath Networks and respects its local Back on Escape', async () => {
    const { user } = render(<Home capabilities={capabilities} />)
    await user.click(screen.getByRole('button', { name: 'Main menu' }))
    const menu = screen.getByRole('dialog', { name: 'Main menu' })
    await user.click(within(menu).getByRole('button', { name: 'Custom Tokens' }))
    const tokens = screen.getByRole('dialog', { name: 'Custom Tokens' })
    await user.click(screen.getByRole('button', { name: 'Add New Token' }))
    const networksTrigger = screen.getByRole('link', { name: 'Enable it in Chains' })
    await user.click(networksTrigger)

    expect(tokens.parentElement!.hasAttribute('inert')).toBe(true)
    expect(menu.parentElement!.hasAttribute('inert')).toBe(true)
    await user.keyboard('{Escape}')

    expect(screen.getByRole('dialog', { name: 'Custom Tokens' })).toBe(tokens)
    expect(screen.getByText("Select token's chain")).toBeTruthy()
    expect(document.activeElement).toBe(networksTrigger)
    await user.keyboard('{Escape}')
    expect(screen.getByRole('dialog', { name: 'Custom Tokens' })).toBe(tokens)
    expect(screen.getByRole('button', { name: 'Add New Token' })).toBeTruthy()
    fireEvent.keyDown(tokens, { key: 'Escape' })
    expect(screen.getByRole('dialog', { name: 'Main menu' })).toBe(menu)
  })

  it('replaces retained history for direct commands and keeps direct Tokens to Networks closing to Home', async () => {
    const { user } = render(<Home capabilities={capabilities} />)
    await user.click(screen.getByRole('button', { name: 'Main menu' }))
    const menu = screen.getByRole('dialog', { name: 'Main menu' })
    await user.click(within(menu).getByRole('button', { name: 'App Info' }))
    act(() => updateWallet({ tray: { homeCommand: { id: 1, view: 'tokens', data: {} } } }))
    expect(menu.isConnected).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Add New Token' }))
    const tokens = screen.getByRole('dialog', { name: 'Custom Tokens' })
    await user.click(screen.getByRole('link', { name: 'Enable it in Chains' }))
    expect(tokens.isConnected).toBe(false)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    const homeTrigger = screen.getByRole('button', { name: 'Main menu' })
    expect(homeTrigger.closest('[inert]')).toBeNull()
  })

  for (const view of ['settings', 'tokens']) {
    it(`opens Menu on Back from directly opened ${view}`, async () => {
      const { user } = render(<Home capabilities={capabilities} />)
      act(() => updateWallet({ tray: { homeCommand: { id: 1, view, data: {} } } }))
      await user.click(screen.getByRole('button', { name: 'Back' }))
      expect(screen.getByRole('dialog', { name: 'Main menu' })).toBeTruthy()
    })
  }
})
import { createQrCameraFake } from '../../../../platform/desktop/renderer/camera.test-support'
