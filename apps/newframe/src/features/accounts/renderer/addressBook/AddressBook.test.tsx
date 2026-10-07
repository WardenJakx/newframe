import { beforeEach, describe, expect, it, mock } from 'bun:test'

import { render, screen } from '../../../../../test/support/componentSetup.tsx'
import { registerTestRuntimeFixture } from '../../../../../test/support/trayClient.ts'
import { walletState } from '../../../../platform/state-sync/renderer/fixtures.test-support.ts'
import {
  createAccountsCapabilityFake,
  type AccountsCapabilityFake
} from '../accountsCapability.test-support.ts'
import { AddressBook } from './AddressBook.tsx'

const fixture = registerTestRuntimeFixture()
let capability: AccountsCapabilityFake

const entry = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045'
const account = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'

describe('AddressBook import', () => {
  beforeEach(() => {
    capability = createAccountsCapabilityFake()
    fixture.state.reset(
      walletState({
        addressNames: {
          [entry]: { name: 'Existing', source: 'address-book' },
          [account]: { name: 'Primary', source: 'account', accountType: 'address' }
        }
      })
    )
  })

  it('previews new, already named and invalid rows, then imports only the new addresses', async () => {
    const { user } = render(<AddressBook capability={capability} onBack={mock()} />)
    const csv = [
      'address,name,chainId',
      '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045,Renamed,1',
      '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48,Token,1',
      '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed,Friend,1',
      '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed,Friend,10',
      '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359,Shop,1',
      'not-an-address,Broken,1'
    ].join('\n')

    await user.upload(
      screen.getByLabelText('Gnosis Safe CSV export'),
      new File([csv], 'safe-address-book.csv', { type: 'text/csv' })
    )

    expect(await screen.findByText('4 addresses in 6 rows')).toBeTruthy()
    expect(screen.getByText('2 new')).toBeTruthy()
    expect(screen.getByText('2 already named')).toBeTruthy()
    expect(screen.getByText('1 invalid row')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Import 2' }))

    expect(capability.importAddressBookEntries.mock.calls).toEqual([
      [
        {
          entries: [
            { address: '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed', name: 'Friend' },
            { address: '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359', name: 'Shop' }
          ]
        }
      ]
    ])
    expect(await screen.findByRole('textbox', { name: 'Search address book' })).toBeTruthy()
  })
})
