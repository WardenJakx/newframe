import { beforeEach, describe, expect, it, mock } from 'bun:test'

import { within } from '@testing-library/react'

import { act, render, screen } from '../../../../test/support/componentSetup'
import { registerTestRuntimeFixture } from '../../../../test/support/rendererClient'
import type { WalletRendererState } from '../../../platform/state-sync/contract/projections'
import { walletState } from '../../../platform/state-sync/renderer/fixtures.test-support'
import { createAccountsCapabilityFake } from './accountsCapability.test-support'
import { AccountSelector } from './AccountSelector'
import { AccountRow } from './AccountSelectorView'

const fixture = registerTestRuntimeFixture()
const first = {
  id: 'account-a',
  address: '0x0000000000000000000000000000000000000001',
  profileId: 'personal',
  name: 'Primary',
  lastSignerType: 'address',
  status: 'ok',
  signer: 'watch',
  requests: {},
  created: '2026-01-01'
} satisfies WalletRendererState['accounts'][string]
const second = {
  ...first,
  id: 'account-b',
  address: '0x0000000000000000000000000000000000000002',
  name: 'Savings'
}

beforeEach(() =>
  fixture.state.reset(
    walletState({
      accounts: { [first.id]: first, [second.id]: second },
      accountOrder: [first.id, second.id],
      currentAccount: first.id
    })
  )
)

describe('AccountSelector', () => {
  it('searches shared rows, closes on selection, and displays only projected selection', async () => {
    const capability = createAccountsCapabilityFake()
    const onOpenChange = mock()
    const { user } = render(
      <AccountSelector capability={{ selectAccount: capability.selectAccount }} onOpenChange={onOpenChange} />
    )
    await user.click(screen.getByRole('button', { name: /Primary/ }))
    const picker = within(screen.getByRole('dialog', { name: 'Select account' }))
    expect(picker.getByRole('button', { name: /Primary/ }).getAttribute('aria-current')).toBe('true')
    expect(
      picker.queryByRole('button', { name: /Add account|Rename|Copy address|account actions|profile/i })
    ).toBeNull()
    expect(picker.queryByLabelText(/Drag .* to reorder/)).toBeNull()
    await user.type(picker.getByRole('textbox', { name: 'Search accounts' }), 'savings')
    expect(picker.queryByRole('button', { name: /Primary/ })).toBeNull()
    await user.click(picker.getByRole('button', { name: /Savings/ }))
    expect(capability.selectAccount).toHaveBeenCalledWith({ accountId: second.id })
    expect(onOpenChange).toHaveBeenLastCalledWith(false)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: /Primary/ })).toBeTruthy()
    act(() => fixture.state.reset({ ...fixture.state.getState(), currentAccount: second.id }))
    expect(screen.getByRole('button', { name: /Savings/ })).toBeTruthy()
  })

  it('closes current-account selection and Escape without switching, and survives failed switching', async () => {
    const capability = createAccountsCapabilityFake()
    capability.selectAccount.mockRejectedValueOnce(new Error('unavailable'))
    const { user } = render(<AccountSelector capability={capability} />)
    await user.click(screen.getByRole('button', { name: /Primary/ }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Primary/ }))
    expect(capability.selectAccount).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /Primary/ }))
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(capability.selectAccount).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: /Primary/ }))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: /Savings/ }))
    expect(screen.getByRole('button', { name: /Primary/ })).toBeTruthy()
  })
})

it('renders the shared account row without selection semantics when static', async () => {
  const { user } = render(
    <AccountRow
      selected={false}
      account={{
        id: 'account-a',
        address: first.address,
        displayName: 'Primary',
        shortAddress: '0x000…0001',
        signerType: 'ledger',
        signerLabel: 'Ledger',
        balanceLabel: '$42.00',
        agentEnabled: false,
        hot: false,
        lastSeedAccount: false,
        profileId: 'personal'
      }}
    />
  )
  const row = screen.getByLabelText('Primary 0x000…0001')
  expect(row.hasAttribute('role')).toBe(false)
  expect(row.hasAttribute('tabindex')).toBe(false)
  expect(screen.queryByRole('button', { name: /Primary/ })).toBeNull()
  expect(screen.getByText('Ledger')).toBeTruthy()
  expect(screen.getByText('$42.00')).toBeTruthy()
  await user.click(row)
  await user.keyboard('{Enter}')
  expect(fixture.state.getState().currentAccount).toBe(first.id)
  expect(screen.queryByRole('dialog')).toBeNull()
})
