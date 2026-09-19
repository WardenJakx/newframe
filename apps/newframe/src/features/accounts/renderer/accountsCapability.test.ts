import { expect, it } from 'bun:test'

import { createRendererClient as createTypedClient } from '../../../../test/support/rendererClient'
import { createAccountsCapability } from './accountsCapability'

const firstAddress = `0x${'1'.repeat(40)}`
const secondAddress = `0x${'2'.repeat(40)}`
const operationId = 'operation-1'

it('maps every semantic account command to its exact catalog payload', async () => {
  const host = createTypedClient()
  const capability = createAccountsCapability(host)

  await capability.updateAccount({ accountId: firstAddress, toAccountId: secondAddress })
  await capability.selectAccount({ accountId: firstAddress })
  await capability.updateAccount({ accountId: firstAddress, name: 'Primary' })
  await capability.removeAccount({ address: firstAddress, removeSeedSigner: true })
  await capability.updateAccount({ operationId, accountId: firstAddress, profileId: 'work' })
  await capability.updateAccount({ accountId: firstAddress, enabled: true })
  await capability.revokeAccountAgentSessions({ accountId: firstAddress })
  await capability.selectProfile({ operationId, profileId: 'work' })
  await capability.createProfile({ operationId, name: 'Work', accountIds: [firstAddress] })
  await capability.updateProfile({ operationId, profileId: 'work', name: 'Archive' })
  await capability.deleteProfile({ operationId, profileId: 'work' })
  await capability.createAccount({
    source: 'signer',
    operationId,
    signerId: 'seed-1',
    address: firstAddress,
    name: 'Primary'
  })
  await capability.createAccount({ source: 'watch', operationId, addressOrName: 'wallet.eth', name: 'Watch' })
  await capability.importSigner({
    operationId,
    source: 'private-key',
    privateKey: `0x${'a'.repeat(64)}`,
    framePassword: 'frame-password',
    accountName: 'Imported'
  })
  await capability.startSignerSession({ operationId, signerId: 'ledger-1' })
  await capability.finishSignerSession({ operationId, signerId: 'ledger-1', outcome: 'ready' })
  await capability.refreshSigner({ operationId, signerId: 'ledger-1' })
  await capability.disconnectSigner({ operationId, signerId: 'ledger-1' })
  await capability.refreshSigner({ operationId, signerId: 'ledger-1', accountCount: 10 })
  await capability.inputSignerSession({
    operationId,
    actionId: 'action-1',
    signerId: 'trezor-1',
    input: 'pin',
    value: '12'
  })
  await capability.importSigner({
    source: 'lattice',
    operationId,
    deviceId: 'device-1',
    deviceName: 'GridPlus'
  })
  await capability.inputSignerSession({
    input: 'pair-code',
    operationId,
    actionId: 'action-2',
    signerId: 'lattice-1',
    value: 'PAIR'
  })
  await capability.writeClipboard({ text: 'copy me' })
  await capability.writeText('copy me again')

  expect(host.executeCommand.mock.calls).toEqual(
    [
      { type: 'account.update', accountId: firstAddress, toAccountId: secondAddress },
      { type: 'account.select', accountId: firstAddress },
      { type: 'account.update', accountId: firstAddress, name: 'Primary' },
      { type: 'account.remove', address: firstAddress, removeSeedSigner: true },
      { type: 'account.update', operationId, accountId: firstAddress, profileId: 'work' },
      { type: 'account.update', accountId: firstAddress, enabled: true },
      { type: 'account.agent-sessions-revoke', accountId: firstAddress },
      { type: 'profile.select', operationId, profileId: 'work' },
      { type: 'profile.create', operationId, name: 'Work', accountIds: [firstAddress] },
      { type: 'profile.update', operationId, profileId: 'work', name: 'Archive' },
      { type: 'profile.delete', operationId, profileId: 'work' },
      {
        type: 'account.create',
        source: 'signer',
        operationId,
        signerId: 'seed-1',
        address: firstAddress,
        name: 'Primary'
      },
      { type: 'account.create', source: 'watch', operationId, addressOrName: 'wallet.eth', name: 'Watch' },
      {
        type: 'signer.import',
        operationId,
        source: 'private-key',
        privateKey: `0x${'a'.repeat(64)}`,
        framePassword: 'frame-password',
        accountName: 'Imported'
      },
      { type: 'signer.session-start', operationId, signerId: 'ledger-1' },
      { type: 'signer.session-finish', operationId, signerId: 'ledger-1', outcome: 'ready' },
      { type: 'signer.refresh', operationId, signerId: 'ledger-1' },
      { type: 'signer.disconnect', operationId, signerId: 'ledger-1' },
      { type: 'signer.refresh', operationId, signerId: 'ledger-1', accountCount: 10 },
      {
        type: 'signer.session-input',
        operationId,
        actionId: 'action-1',
        signerId: 'trezor-1',
        input: 'pin',
        value: '12'
      },
      { type: 'signer.import', source: 'lattice', operationId, deviceId: 'device-1', deviceName: 'GridPlus' },
      {
        type: 'signer.session-input',
        input: 'pair-code',
        operationId,
        actionId: 'action-2',
        signerId: 'lattice-1',
        value: 'PAIR'
      },
      { type: 'clipboard.write', text: 'copy me' },
      { type: 'clipboard.write', text: 'copy me again' }
    ].map((command) => [command])
  )
})

it('maps every semantic account query to its exact catalog payload', async () => {
  const host = createTypedClient()
  const capability = createAccountsCapability(host)

  await capability.exportAccountPrivateKey({ accountId: firstAddress })
  await capability.listMovableProfileAccounts()
  await capability.inspectAddressChainUsage({ addresses: [firstAddress, secondAddress] })
  await capability.getSecurityStatus()
  await capability.locateKeystore()
  await capability.generateSeed()

  expect(host.executeQuery.mock.calls).toEqual(
    [
      { type: 'account.private-key-export', accountId: firstAddress },
      { type: 'profile.movable-accounts' },
      { type: 'address.chain-usage', addresses: [firstAddress, secondAddress] },
      { type: 'security.status' },
      { type: 'keystore.locate' },
      { type: 'seed.generate' }
    ].map((query) => [query])
  )
})
