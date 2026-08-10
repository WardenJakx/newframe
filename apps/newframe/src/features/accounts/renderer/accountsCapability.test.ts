import { expect, it } from 'bun:test'

import { createRendererClient as createTypedClient } from '../../../../test/support/rendererClient'
import { createAccountsCapability } from './accountsCapability'

const firstAddress = `0x${'1'.repeat(40)}`
const secondAddress = `0x${'2'.repeat(40)}`
const operationId = 'operation-1'

it('maps every semantic account command to its exact catalog payload', async () => {
  const host = createTypedClient()
  const capability = createAccountsCapability(host)

  await capability.reorderAccount({ fromAccountId: firstAddress, toAccountId: secondAddress })
  await capability.selectAccount({ accountId: firstAddress })
  await capability.renameAccount({ accountId: firstAddress, name: 'Primary' })
  await capability.removeAccount({ address: firstAddress, removeSeedSigner: true })
  await capability.moveAccountToProfile({ operationId, accountId: firstAddress, profileId: 'work' })
  await capability.setAccountAgentAccess({ accountId: firstAddress, enabled: true })
  await capability.revokeAccountAgentSessions({ accountId: firstAddress })
  await capability.selectProfile({ operationId, profileId: 'work' })
  await capability.createProfile({ operationId, name: 'Work', accountIds: [firstAddress] })
  await capability.renameProfile({ operationId, profileId: 'work', name: 'Archive' })
  await capability.deleteProfile({ operationId, profileId: 'work' })
  await capability.addAccountFromSigner({
    operationId,
    signerId: 'seed-1',
    address: firstAddress,
    name: 'Primary'
  })
  await capability.addWatchAccount({ operationId, addressOrName: 'wallet.eth', name: 'Watch' })
  await capability.importSigner({
    operationId,
    source: 'private-key',
    privateKey: `0x${'a'.repeat(64)}`,
    framePassword: 'frame-password',
    accountName: 'Imported'
  })
  await capability.startHardwareSession({ operationId, signerId: 'ledger-1' })
  await capability.finishHardwareSession({ operationId, signerId: 'ledger-1', outcome: 'ready' })
  await capability.reloadSigner({ operationId, signerId: 'ledger-1' })
  await capability.disconnectSigner({ operationId, signerId: 'ledger-1' })
  await capability.loadLedgerAccounts({ operationId, signerId: 'ledger-1', accountCount: 10 })
  await capability.submitTrezorInput({
    operationId,
    actionId: 'action-1',
    signerId: 'trezor-1',
    input: 'pin',
    value: '12'
  })
  await capability.createLatticeSigner({
    operationId,
    deviceId: 'device-1',
    deviceName: 'GridPlus'
  })
  await capability.pairLattice({
    operationId,
    actionId: 'action-2',
    signerId: 'lattice-1',
    pairCode: 'PAIR'
  })
  await capability.writeClipboard({ text: 'copy me' })
  await capability.writeText('copy me again')

  expect(host.executeCommand.mock.calls.map(([command]) => command)).toEqual([
    { type: 'account.reorder', fromAccountId: firstAddress, toAccountId: secondAddress },
    { type: 'account.select', accountId: firstAddress },
    { type: 'account.rename', accountId: firstAddress, name: 'Primary' },
    { type: 'account.remove', address: firstAddress, removeSeedSigner: true },
    { type: 'account.profile-move', operationId, accountId: firstAddress, profileId: 'work' },
    { type: 'account.agent-access-set', accountId: firstAddress, enabled: true },
    { type: 'account.agent-sessions-revoke', accountId: firstAddress },
    { type: 'profile.select', operationId, profileId: 'work' },
    { type: 'profile.create', operationId, name: 'Work', accountIds: [firstAddress] },
    { type: 'profile.rename', operationId, profileId: 'work', name: 'Archive' },
    { type: 'profile.delete', operationId, profileId: 'work' },
    {
      type: 'account.add-from-signer',
      operationId,
      signerId: 'seed-1',
      address: firstAddress,
      name: 'Primary'
    },
    { type: 'account.watch-add', operationId, addressOrName: 'wallet.eth', name: 'Watch' },
    {
      type: 'signer.import',
      operationId,
      source: 'private-key',
      privateKey: `0x${'a'.repeat(64)}`,
      framePassword: 'frame-password',
      accountName: 'Imported'
    },
    { type: 'signer.hardware-session-start', operationId, signerId: 'ledger-1' },
    { type: 'signer.hardware-session-finish', operationId, signerId: 'ledger-1', outcome: 'ready' },
    { type: 'signer.reload', operationId, signerId: 'ledger-1' },
    { type: 'signer.disconnect', operationId, signerId: 'ledger-1' },
    { type: 'signer.ledger-accounts-load', operationId, signerId: 'ledger-1', accountCount: 10 },
    {
      type: 'signer.trezor-input',
      operationId,
      actionId: 'action-1',
      signerId: 'trezor-1',
      input: 'pin',
      value: '12'
    },
    { type: 'signer.lattice-create', operationId, deviceId: 'device-1', deviceName: 'GridPlus' },
    {
      type: 'signer.lattice-pair',
      operationId,
      actionId: 'action-2',
      signerId: 'lattice-1',
      pairCode: 'PAIR'
    },
    { type: 'clipboard.write', text: 'copy me' },
    { type: 'clipboard.write', text: 'copy me again' }
  ])
})

it('maps every semantic account query to its exact catalog payload', async () => {
  const host = createTypedClient()
  const capability = createAccountsCapability(host)

  await capability.exportAccountPrivateKey({ accountId: firstAddress, password: 'frame-password' })
  await capability.listMovableProfileAccounts()
  await capability.inspectAddressChainUsage({ addresses: [firstAddress, secondAddress] })
  await capability.getSecurityStatus()
  await capability.locateKeystore()
  await capability.generateSeed()

  expect(host.executeQuery.mock.calls.map(([query]) => query)).toEqual([
    { type: 'account.private-key-export', accountId: firstAddress, password: 'frame-password' },
    { type: 'profile.movable-accounts' },
    { type: 'address.chain-usage', addresses: [firstAddress, secondAddress] },
    { type: 'security.status' },
    { type: 'keystore.locate' },
    { type: 'seed.generate' }
  ])
})
