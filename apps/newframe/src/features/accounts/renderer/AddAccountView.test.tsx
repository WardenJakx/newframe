import { expect, it, mock } from 'bun:test'

import { render, screen } from '../../../../test/support/componentSetup'
import { AddAccountView, type AddAccountViewEvents } from './AddAccountView'

function events() {
  return {
    onBack: mock(),
    onCategorySelect: mock(),
    onCreateGeneratedSeed: mock(),
    onCreateLattice: mock(),
    onCreateSeedOpen: mock(),
    onGeneratedSeedBackupToggle: mock(),
    onGeneratedSeedCopy: mock(),
    onGeneratedSeedRegenerate: mock(),
    onHardwareAddressSelect: mock(),
    onHardwarePair: mock(),
    onHardwarePairCodeChange: mock(),
    onHardwarePassphraseChange: mock(),
    onHardwarePinAppend: mock(),
    onHardwarePinDelete: mock(),
    onHardwareReload: mock(),
    onHardwareRemove: mock(),
    onHardwareSelect: mock(),
    onHardwareSubmit: mock(),
    onImportSeedOpen: mock(),
    onInputChange: mock(),
    onKeystoreLocate: mock(),
    onKeystorePasswordChange: mock(),
    onLatticeNameChange: mock(),
    onNameChange: mock(),
    onPageChange: mock(),
    onPageInputChange: mock(),
    onPasswordChange: mock(),
    onStoredSeedAddressSelect: mock(),
    onStoredSeedExpand: mock(),
    onStoredSeedSelect: mock(),
    onSubmitImport: mock(),
    onTypeSelect: mock()
  } satisfies AddAccountViewEvents
}

it('renders the focused import model and emits semantic draft and submit events', async () => {
  const callbacks = events()
  const { user } = render(
    <AddAccountView
      events={callbacks}
      flow={{
        kind: 'import',
        model: {
          accountType: 'privateKey',
          error: '',
          input: '',
          keystorePassword: '',
          keystoreSelected: false,
          name: 'Hot Account',
          needsFramePassword: false,
          password: '',
          passwordLabel: 'Newframe password',
          status: ''
        }
      }}
    />
  )

  await user.type(screen.getByLabelText('Private key'), 'secret')
  await user.clear(screen.getByLabelText('Account name'))
  await user.type(screen.getByLabelText('Account name'), 'Imported')
  await user.click(screen.getByRole('button', { name: 'Create account' }))

  expect(callbacks.onInputChange.mock.calls.map(([value]) => value).join('')).toBe('secret')
  expect(callbacks.onNameChange.mock.calls.map(([value]) => value)).toContain('')
  expect(callbacks.onSubmitImport.mock.calls).toHaveLength(1)
})

it('renders hardware paging and address selection from focused view models', async () => {
  const callbacks = events()
  const hardwareAddress = `0x${'2'.repeat(40)}`
  const { user } = render(
    <AddAccountView
      events={callbacks}
      flow={{
        kind: 'hardware',
        model: {
          mode: 'details',
          emptyText: '',
          error: '',
          input: { kind: 'none' },
          pagination: { input: '1', maxPage: 2, page: 1 },
          rows: [
            {
              address: hardwareAddress,
              chains: ['Ethereum'],
              imported: false,
              index: 0,
              label: 'Wallet 1',
              shortAddress: '0x222…2222',
              usage: 'used'
            }
          ],
          signer: {
            id: 'ledger-1',
            loading: false,
            name: 'Ledger',
            status: 'Connected',
            type: 'ledger'
          },
          status: '',
          title: 'Ledger'
        }
      }}
    />
  )

  await user.click(screen.getByRole('button', { name: 'Add Wallet 1' }))
  await user.click(screen.getByRole('button', { name: 'Next account page' }))

  expect(callbacks.onHardwareAddressSelect.mock.calls).toEqual([[hardwareAddress]])
  expect(callbacks.onPageChange.mock.calls).toEqual([[2]])
  expect(screen.getByText('Used on Ethereum')).toBeTruthy()
})
