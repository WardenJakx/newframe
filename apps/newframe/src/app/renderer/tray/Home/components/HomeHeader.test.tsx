import { expect, it, mock } from 'bun:test'

import { Icon } from '@newframe/ui/icon'
import { within } from '@testing-library/react'
import { renderToStaticMarkup } from 'react-dom/server'

import { act, render, screen } from '../../../../../../test/support/componentSetup'
import { registerTestRuntimeFixture } from '../../../../../../test/support/rendererClient'
import { walletState } from '../../../../../platform/state-sync/renderer/fixtures.test-support'
import { shortAddress } from '../../../../../shared/renderer/ui/AddressIdentity'
import { HomeUiProvider } from '../state/HomeUiProvider'
import { HomeHeader } from './HomeHeader'

const fixture = registerTestRuntimeFixture()

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
