import { expect, it, mock } from 'bun:test'
import type { Mock } from 'bun:test'

import { createTestStore } from '../../../../../test/support/createTestStore'
import { createOperationService } from '../../../../platform/operations/service'
import { createProductionAccountOnboardingAdapters } from './production'
import { createAccountOnboardingService, type AccountOnboardingPorts } from './service'

const owner = { clientType: 'wallet-ui' as const, windowInstanceId: 'onboarding-test' }
const otherOwner = { ...owner, windowInstanceId: 'other-window' }
const addressA = '0x1111111111111111111111111111111111111111'
const addressB = '0x2222222222222222222222222222222222222222'
const flush = () => new Promise((resolve) => setImmediate(resolve))

function harness() {
  const testStore = createTestStore()
  let now = 1
  const accounts = new Map<string, unknown>()
  const signers = new Map<string, { id: string; type: string; addresses: string[]; status?: string }>([
    ['seed-1', { id: 'seed-1', type: 'seed', addresses: [addressA] }],
    ['trezor-1', { id: 'trezor-1', type: 'trezor', addresses: [], status: 'need pin' }],
    ['ledger-1', { id: 'ledger-1', type: 'ledger', addresses: [addressB], status: 'ok' }],
    ['lattice-1', { id: 'lattice-1', type: 'lattice', addresses: [addressB], status: 'pair' }]
  ])
  const ports: AccountOnboardingPorts = {
    accounts: {
      add: mock((address: string, name: string, signer: { type: string }) => {
        accounts.set(address.toLowerCase(), { address, name, signer })
      }),
      get: (accountId) => accounts.get(accountId),
      select: mock(async () => undefined)
    },
    hardware: {
      configureLattice: mock((deviceId: string) => `lattice-${deviceId}`),
      loadLedgerAccounts: mock(() => true),
      pairLattice: mock(async () => true),
      submitTrezorInput: mock(() => true)
    },
    keystore: { locate: mock(async () => ({ version: 3 })) },
    nameResolution: { resolve: mock(async () => addressB) },
    operations: createOperationService({ store: testStore.store, clock: { now: () => now++ } }),
    signers: {
      create: mock(async () => ({ id: 'seed-imported', type: 'seed', addresses: [addressA] })),
      get: (signerId) => signers.get(signerId),
      reload: mock((signerId: string) => signers.has(signerId)),
      remove: mock((signerId: string) => signers.delete(signerId))
    },
    secrets: {
      exportPrivateKey: mock(async () => ({ type: 'privateKey', value: '0xsecret' })),
      generateSeedPhrase: mock(async () => 'seed phrase')
    }
  }
  const service = createAccountOnboardingService(ports)
  const operation = (id: string) => testStore.getState().operations[id]?.operation
  return { accounts, operation, ports, service, signers }
}

it('owns account creation and authorized hardware sessions while keeping all onboarding secrets private', async () => {
  const { accounts, operation, ports, service, signers } = harness()

  service.importSigner(
    {
      type: 'signer.import',
      operationId: 'import-phrase',
      source: 'phrase',
      phrase: 'secret recovery phrase material',
      framePassword: 'local frame password',
      accountName: 'Imported'
    },
    owner
  )
  await flush()
  expect(operation('import-phrase')).toMatchObject({
    status: 'succeeded',
    phase: 'selected',
    entityRefs: [
      { type: 'signer', id: 'seed-imported' },
      { type: 'account', id: addressA }
    ]
  })
  expect(JSON.stringify(operation('import-phrase'))).not.toContain('secret recovery')
  expect(JSON.stringify(operation('import-phrase'))).not.toContain('frame password')
  expect((ports.accounts.add as Mock<any>).mock.calls.at(-1)).toEqual([
    addressA,
    'Imported',
    { type: 'seed' }
  ])
  expect((ports.accounts.select as Mock<any>).mock.calls.at(-1)).toEqual([addressA])

  service.addWatch(
    {
      type: 'account.watch-add',
      operationId: 'watch',
      addressOrName: 'alice.eth',
      name: 'Alice'
    },
    owner
  )
  await flush()
  expect(operation('watch')).toMatchObject({ status: 'succeeded', phase: 'selected' })
  expect((ports.nameResolution.resolve as Mock<any>).mock.calls).toEqual([['alice.eth']])

  accounts.clear()
  service.addFromSigner(
    {
      type: 'account.add-from-signer',
      operationId: 'stored-seed',
      signerId: 'seed-1',
      address: addressA
    },
    owner
  )
  await flush()
  expect((ports.accounts.add as Mock<any>).mock.calls.at(-1)).toEqual([
    addressA,
    'Hot Account',
    { type: 'seed' }
  ])

  expect(await service.locateKeystore()).toEqual({ version: 3 })
  accounts.set(addressA, { address: addressA })
  expect(await service.exportPrivateKey(addressA, 'wallet-password')).toBe('0xsecret')
  expect(await service.exportPrivateKey('missing', 'wallet-password')).toBeUndefined()
  expect(ports.secrets.exportPrivateKey).toHaveBeenCalledWith(addressA, 'wallet-password')
  expect(await service.generateSeedPhrase()).toBe('seed phrase')

  expect(
    service.startHardwareSession(
      { type: 'signer.hardware-session-start', operationId: 'trezor-session', signerId: 'trezor-1' },
      owner
    )
  ).toBeTrue()
  await flush()
  expect(operation('trezor-session')).toMatchObject({
    type: 'signer.hardware-session',
    status: 'pending',
    phase: 'awaiting_device',
    entityRefs: [{ type: 'signer', id: 'trezor-1' }]
  })

  const pinCommand = {
    type: 'signer.trezor-input' as const,
    operationId: 'trezor-session',
    actionId: 'trezor-pin',
    signerId: 'trezor-1',
    input: 'pin' as const,
    value: '938475'
  }
  expect(service.submitTrezorInput(pinCommand, otherOwner)).toBeFalse()
  expect(service.submitTrezorInput({ ...pinCommand, signerId: 'ledger-1' }, owner)).toBeFalse()
  expect(service.submitTrezorInput(pinCommand, owner)).toBeTrue()
  await flush()
  expect((ports.hardware.submitTrezorInput as Mock<any>).mock.calls).toEqual([[pinCommand]])
  expect(operation('trezor-session')).toMatchObject({ status: 'pending', phase: 'pin_submitted' })
  expect(operation('trezor-pin')).toMatchObject({ status: 'succeeded', phase: 'accepted' })
  expect(
    JSON.stringify({ session: operation('trezor-session'), action: operation('trezor-pin') })
  ).not.toContain('938475')
  expect(service.submitTrezorInput(pinCommand, owner)).toBeTrue()
  await flush()
  expect((ports.hardware.submitTrezorInput as Mock<any>).mock.calls).toHaveLength(1)
  expect(
    service.finishHardwareSession(
      {
        type: 'signer.hardware-session-finish',
        operationId: 'trezor-session',
        signerId: 'trezor-1',
        outcome: 'ready'
      },
      owner
    )
  ).toBeFalse()
  signers.get('trezor-1')!.status = 'ok'
  expect(
    service.finishHardwareSession(
      {
        type: 'signer.hardware-session-finish',
        operationId: 'trezor-session',
        signerId: 'trezor-1',
        outcome: 'ready'
      },
      owner
    )
  ).toBeTrue()
  expect(operation('trezor-session')).toMatchObject({ status: 'succeeded', phase: 'ready' })

  service.createLattice(
    {
      type: 'signer.lattice-create',
      operationId: 'lattice-session',
      deviceId: 'device-1',
      deviceName: 'GridPlus'
    },
    owner
  )
  await flush()
  expect(operation('lattice-session')).toMatchObject({
    status: 'pending',
    entityRefs: [{ type: 'signer', id: 'lattice-device-1' }]
  })
  signers.set('lattice-device-1', {
    id: 'lattice-device-1',
    type: 'lattice',
    addresses: [],
    status: 'pair'
  })
  service.pairLattice(
    {
      type: 'signer.lattice-pair',
      operationId: 'lattice-session',
      actionId: 'lattice-pair',
      signerId: 'lattice-device-1',
      pairCode: 'LOCAL-PAIR-CODE'
    },
    owner
  )
  await flush()
  expect(operation('lattice-session')).toMatchObject({ status: 'pending', phase: 'pairing' })
  expect(JSON.stringify(operation('lattice-pair'))).not.toContain('LOCAL-PAIR-CODE')
  expect(
    service.finishHardwareSession(
      {
        type: 'signer.hardware-session-finish',
        operationId: 'lattice-session',
        signerId: 'lattice-device-1',
        outcome: 'cancelled'
      },
      owner
    )
  ).toBeTrue()
  expect(operation('lattice-session')).toMatchObject({ status: 'succeeded', phase: 'cancelled' })

  service.loadLedgerAccounts(
    {
      type: 'signer.ledger-accounts-load',
      operationId: 'ledger-load',
      signerId: 'ledger-1',
      accountCount: 10
    },
    owner
  )
  await flush()
  expect((ports.hardware.loadLedgerAccounts as Mock<any>).mock.calls).toEqual([['ledger-1', 10]])
  expect(operation('ledger-load')).toMatchObject({ status: 'succeeded', phase: 'requested' })

  let phraseCallback: (error: unknown, value?: string) => void = () => undefined
  const callbacks = {
    createFromPhrase: mock(
      (
        _phrase: string,
        _password: string,
        done: (error: unknown, value?: { id: string; type: string; addresses: string[] }) => void
      ) => done(null, { id: 'callback-seed', type: 'seed', addresses: [addressA] })
    ),
    createFromPrivateKey: mock(),
    createFromKeystore: mock(),
    exportAccountPrivateKey: mock(
      (
        _address: string,
        _password: string,
        done: (error: unknown, value?: { type: string; value: string }) => void
      ) => done(null, { type: 'privateKey', value: '0xcallback-secret' })
    ),
    get: mock(() => undefined),
    newPhrase: mock((done: (error: unknown, value?: string) => void) => {
      phraseCallback = done
    }),
    reload: mock(),
    remove: mock()
  }
  const production = createProductionAccountOnboardingAdapters({
    signers: callbacks as never,
    store: { getState: () => ({ updateLattice: mock() }) },
    trezorBridge: {
      pinEntered: mock(),
      passphraseEntered: mock(),
      enterPassphraseOnDevice: mock()
    }
  })
  expect(
    await production.signers.create({
      type: 'signer.import',
      operationId: 'callback-import',
      source: 'phrase',
      phrase: 'callback-local-phrase',
      framePassword: 'callback-local-password'
    })
  ).toMatchObject({ id: 'callback-seed' })
  expect(callbacks.createFromPhrase.mock.calls[0]).toEqual([
    'callback-local-phrase',
    'callback-local-password',
    expect.any(Function)
  ])
  const pendingPhrase = production.secrets.generateSeedPhrase()
  production.dispose()
  phraseCallback(null, 'late phrase')
  await expect(pendingPhrase).rejects.toThrow('disposed before the operation completed')
})
