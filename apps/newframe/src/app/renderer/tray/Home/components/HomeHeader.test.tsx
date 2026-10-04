import { expect, it, mock } from 'bun:test'

import { Icon } from '@newframe/ui/icon'
import { within } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'

import { act, render, screen } from '../../../../../../test/support/componentSetup.tsx'
import { registerTestRuntimeFixture } from '../../../../../../test/support/rendererClient.ts'
import { walletState } from '../../../../../platform/state-sync/renderer/fixtures.test-support.ts'
import { shortAddress } from '../../../../../shared/renderer/ui/AddressIdentity.tsx'
import { HomeUiProvider, useHomeUiStore } from '../state/HomeUiProvider.tsx'
import { HomeHeader } from './HomeHeader.tsx'

const fixture = registerTestRuntimeFixture()

function OverlayProbe() {
  const overlay = useHomeUiStore((state) => state.overlay.type)
  return <output aria-label='Home overlay'>{overlay}</output>
}

it('keeps a selected Safe badge across signer histories and copies the full address', async () => {
  const address = `0x${'ab'.repeat(20)}`
  const account = {
    id: address,
    address,
    profileId: 'personal',
    name: 'Team Safe',
    status: 'ok',
    signer: '',
    requests: {},
    created: 'test:1',
    safe: { '1': { chainId: 1, address, configuration: { owners: [address], threshold: 1, nonce: '0' } } }
  }
  const copyText = mock(async (_input: { text: string }) => ({ ok: true as const }))
  const view = renderToStaticMarkup(<Icon name='safe' size='small' />)
  fixture.state.reset(
    walletState({
      accounts: { [address]: { ...account, lastSignerType: 'Address' } },
      currentAccount: address
    })
  )
  const { user } = render(
    <HomeUiProvider>
      <HomeHeader capability={{ copyText }} />
    </HomeUiProvider>
  )
  for (const lastSignerType of ['Address', 'seed', 'ledger']) {
    act(() =>
      fixture.state.reset(
        walletState({ accounts: { [address]: { ...account, lastSignerType } }, currentAccount: address })
      )
    )
    const selector = screen.getByRole('button', { name: 'Accounts' })
    expect(within(selector).getByRole('presentation', { hidden: true })).toBeTruthy()
    expect(selector.innerHTML).toContain(view.slice(view.indexOf('<svg'), view.indexOf('</svg>') + 6))
    expect(screen.getByText(shortAddress(address))).toBeTruthy()
  }
  await user.click(screen.getByRole('button', { name: 'Copy account address' }))
  expect(copyText).toHaveBeenCalledWith({ text: address })
})

it('shows actual Tor connection state and opens settings from the indicator', async () => {
  fixture.state.reset(walletState({ tor: { available: true, connection: 'connected' } }))
  const { user } = render(
    <HomeUiProvider>
      <HomeHeader capability={{ copyText: mock(async () => ({ ok: true as const })) }} />
      <OverlayProbe />
    </HomeUiProvider>
  )
  await user.click(screen.getByRole('button', { name: 'Traffic proxied via Tor' }))
  expect(screen.getByRole('status', { name: 'Home overlay' }).textContent).toBe('settings')
  act(() =>
    fixture.state.reset(walletState({ torEnabled: false, tor: { available: true, connection: 'connected' } }))
  )
  expect(screen.getByRole('button', { name: 'Traffic proxied via Tor' })).toBeTruthy()
  for (const [connection, label] of [
    ['connecting', 'Connecting to Tor'],
    ['error', 'Tor is unavailable'],
    ['direct', 'Tor disabled']
  ] as const) {
    act(() => fixture.state.reset(walletState({ tor: { available: true, connection } })))
    expect(screen.getByRole('button', { name: label })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Traffic proxied via Tor' })).toBeNull()
  }
})
