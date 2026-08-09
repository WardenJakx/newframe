import { expect, it, mock, spyOn } from 'bun:test'

import type { OperationRecord } from '../../../platform/operations/operation'
import { act, cleanup, render, screen, waitFor } from '../../../../test/support/componentSetup'
import { registerTestRuntimeFixture } from '../../../../test/support/rendererClient'
import { walletState } from '../../../platform/state-sync/renderer/fixtures.test-support.ts'
import { AddAccount } from './AddAccount'
import { createAccountsCapabilityFake, type AccountsCapabilityFake } from './accountsCapability.test-support'

const fixture = registerTestRuntimeFixture()
let capability: AccountsCapabilityFake
const address = (digit: string) => `0x${digit.repeat(40)}`
const signer = (id: string, type: string, status: string, addresses: string[] = []) => ({
  addresses,
  appVersion: { major: 1, minor: 0, patch: 0 },
  id,
  model: type,
  name: type === 'lattice' ? 'GridPlus' : type[0].toUpperCase() + type.slice(1),
  status,
  type
})

it('keeps drafts local and follows projected onboarding and hardware session state across every add path', async () => {
  let state = walletState({})
  const reset = (overrides: Parameters<typeof walletState>[0] = {}) => {
    cleanup()
    capability = createAccountsCapabilityFake()
    capability.inspectAddressChainUsage.mockImplementation(async ({ addresses }) => ({
      ok: true,
      usage: addresses.map((entry) => ({ address: entry, chainIds: [], complete: true }))
    }))
    capability.locateKeystore.mockResolvedValue({
      ok: true,
      keystore: { version: 3, crypto: {} }
    })
    capability.generateSeed.mockResolvedValue({ ok: true, phrase: 'one two three four' })
    state = walletState(overrides)
    fixture.state.reset(state)
  }
  const publish = (operation: OperationRecord) => {
    state = { ...state, operations: { ...state.operations, [operation.id]: operation } }
    act(() => fixture.state.reset(state))
  }
  const operation = (
    id: string,
    type: string,
    status: 'pending' | 'succeeded' | 'failed',
    error?: OperationRecord['error']
  ): OperationRecord => ({
    id,
    type,
    status,
    startedAt: 1,
    updatedAt: status === 'pending' ? 1 : 2,
    ...(status === 'pending' ? {} : { finishedAt: 2 }),
    ...(error ? { error } : {})
  })

  reset()
  let resolveStaleAcknowledgement!: (result: { ok: false; error: 'invalid_command' }) => void
  capability.addWatchAccount.mockImplementation((input) =>
    input.addressOrName === 'old.eth'
      ? new Promise((resolve) => {
          resolveStaleAcknowledgement = resolve
        })
      : Promise.resolve({ ok: true })
  )
  const closeWatch = mock()
  let view = render(<AddAccount capability={capability} initialType='watch' onClose={closeWatch} />)
  await view.user.type(screen.getByLabelText('Address or gns/ens name'), 'old.eth')
  await view.user.click(screen.getByRole('button', { name: 'Create account' }))
  const staleWatch = capability.addWatchAccount.mock.calls.at(-1)![0]
  await view.user.clear(screen.getByLabelText('Address or gns/ens name'))
  await view.user.type(screen.getByLabelText('Address or gns/ens name'), address('2'))
  await view.user.click(screen.getByRole('button', { name: 'Create account' }))
  const currentWatch = capability.addWatchAccount.mock.calls.at(-1)![0]
  expect(currentWatch).toEqual({
    operationId: expect.any(String),
    addressOrName: address('2'),
    name: 'Watch Account'
  })
  await act(async () => {
    resolveStaleAcknowledgement({ ok: false, error: 'invalid_command' })
    await Promise.resolve()
  })
  expect(screen.queryByText('Could not add the account.')).toBeNull()
  publish(
    operation(staleWatch.operationId, 'account.watch-add', 'failed', {
      code: 'stale_failure',
      message: 'A stale operation failed'
    })
  )
  expect(screen.queryByText('A stale operation failed')).toBeNull()
  publish(operation(currentWatch.operationId, 'account.watch-add', 'succeeded'))
  await waitFor(() => expect(closeWatch.mock.calls).toHaveLength(1))

  reset()
  view = render(<AddAccount capability={capability} initialType='keystore' onClose={mock()} />)
  await view.user.click(screen.getByRole('button', { name: 'Choose JSON backup file' }))
  await view.user.type(screen.getByLabelText('JSON backup file password'), 'file-secret')
  await view.user.click(screen.getByRole('button', { name: 'Create account' }))
  expect(capability.importSigner.mock.calls.at(-1)![0]).toEqual({
    operationId: expect.any(String),
    source: 'keystore',
    keystore: { version: 3, crypto: {} },
    keystorePassword: 'file-secret',
    framePassword: '',
    accountName: 'Hot Account'
  })
  expect(capability.locateKeystore.mock.calls).toHaveLength(1)

  reset()
  view = render(<AddAccount capability={capability} onClose={mock()} />)
  await view.user.click(screen.getByRole('button', { name: 'Create recovery phrase' }))
  expect(await screen.findByText('one')).toBeTruthy()
  await view.user.click(screen.getByRole('button', { name: 'Recovery phrase saved' }))
  await view.user.click(screen.getByRole('button', { name: 'Create account' }))
  expect(capability.importSigner.mock.calls.at(-1)![0]).toEqual({
    operationId: expect.any(String),
    source: 'phrase',
    phrase: 'one two three four',
    framePassword: '',
    accountName: 'Hot Account'
  })

  reset({ signers: { 'seed-1': signer('seed-1', 'seed', 'ok', [address('1')]) } })
  view = render(<AddAccount capability={capability} onClose={mock()} />)
  await view.user.click(screen.getByRole('button', { name: 'Add from stored recovery phrases' }))
  await view.user.click(screen.getByRole('button', { name: 'Add address' }))
  await view.user.click(screen.getByRole('button', { name: 'Add Wallet 1' }))
  expect(capability.addAccountFromSigner.mock.calls.at(-1)![0]).toEqual({
    operationId: expect.any(String),
    signerId: 'seed-1',
    address: address('1'),
    name: 'Hot Account'
  })

  reset({
    ledger: { derivation: 'live', liveAccountLimit: 5 },
    signers: {
      'ledger-1': signer(
        'ledger-1',
        'ledger',
        'ok',
        Array.from({ length: 5 }, (_, index) => address(String(index + 3)))
      )
    }
  })
  view = render(
    <AddAccount
      capability={capability}
      initialSelectedSigner='ledger-1'
      initialType='ledger'
      onClose={mock()}
    />
  )
  await waitFor(() => expect(capability.startHardwareSession.mock.calls.length).toBe(1))
  await view.user.click(screen.getByRole('button', { name: 'Next account page' }))
  expect(capability.loadLedgerAccounts.mock.calls.at(-1)![0]).toEqual({
    operationId: expect.any(String),
    signerId: 'ledger-1',
    accountCount: 10
  })

  reset({ signers: { 'lattice-1': signer('lattice-1', 'lattice', 'pair') } })
  view = render(
    <AddAccount
      capability={capability}
      initialSelectedSigner='lattice-1'
      initialType='lattice'
      onClose={mock()}
    />
  )
  await waitFor(() => expect(capability.startHardwareSession.mock.calls.length).toBe(1))
  const latticeSession = capability.startHardwareSession.mock.calls.at(-1)![0]
  await view.user.type(screen.getByLabelText('GridPlus pairing code'), 'pair-secret')
  await view.user.click(screen.getByRole('button', { name: 'Pair' }))
  const latticePair = capability.pairLattice.mock.calls.at(-1)![0]
  expect(latticePair).toEqual({
    operationId: latticeSession.operationId,
    actionId: expect.any(String),
    signerId: 'lattice-1',
    pairCode: 'PAIR-SECRET'
  })
  expect(screen.queryByText('GridPlus paired')).toBeNull()
  publish(operation(latticePair.actionId, 'signer.lattice-pair', 'succeeded'))
  expect(await screen.findByText('GridPlus paired')).toBeTruthy()

  reset({ signers: { 'trezor-1': signer('trezor-1', 'trezor', 'need pin') } })
  view = render(
    <AddAccount
      capability={capability}
      initialSelectedSigner='trezor-1'
      initialType='trezor'
      onClose={mock()}
    />
  )
  await waitFor(() => expect(capability.startHardwareSession.mock.calls.length).toBe(1))
  const trezorSession = capability.startHardwareSession.mock.calls.at(-1)![0]
  await view.user.click(screen.getByRole('button', { name: 'PIN position 1' }))
  await view.user.click(screen.getByRole('button', { name: 'Submit Trezor PIN' }))
  expect(capability.submitTrezorInput.mock.calls.at(-1)![0]).toEqual({
    operationId: trezorSession.operationId,
    actionId: expect.any(String),
    signerId: 'trezor-1',
    input: 'pin',
    value: '1'
  })
  state = {
    ...state,
    signers: {
      ...state.signers,
      'trezor-1': {
        ...state.signers['trezor-1'],
        capabilities: ['Capability_PassphraseEntry'],
        status: 'enter passphrase'
      }
    }
  }
  act(() => fixture.state.reset(state))
  const passphrase = screen.getByLabelText('Trezor passphrase') as HTMLInputElement
  await view.user.type(passphrase, 'keep-local')
  await view.user.click(screen.getByRole('button', { name: 'Enter passphrase on Trezor' }))
  expect(capability.submitTrezorInput.mock.calls.at(-1)![0]).toEqual({
    operationId: trezorSession.operationId,
    actionId: expect.any(String),
    signerId: 'trezor-1',
    input: 'device-passphrase'
  })
  expect(passphrase.value).toBe('keep-local')
  await view.user.click(screen.getByRole('button', { name: 'Back' }))
  expect(capability.finishHardwareSession.mock.calls.map(([input]) => input)).toContainEqual({
    operationId: trezorSession.operationId,
    signerId: 'trezor-1',
    outcome: 'cancelled'
  })
  expect(capability.disconnectSigner.mock.calls).toHaveLength(0)
}, 2_000)

it('maps direct recovery-phrase and private-key imports to focused signer commands', async () => {
  fixture.state.reset(walletState({}))
  capability = createAccountsCapabilityFake()
  let view = render(<AddAccount capability={capability} initialType='seed' onClose={mock()} />)
  await view.user.type(
    screen.getByLabelText('Recovery phrase'),
    'one two three four five six seven eight nine ten eleven twelve'
  )
  await view.user.click(screen.getByRole('button', { name: 'Create account' }))
  expect(capability.importSigner.mock.calls.at(-1)?.[0]).toEqual({
    operationId: expect.any(String),
    source: 'phrase',
    phrase: 'one two three four five six seven eight nine ten eleven twelve',
    framePassword: '',
    accountName: 'Hot Account'
  })

  cleanup()
  capability = createAccountsCapabilityFake()
  view = render(<AddAccount capability={capability} initialType='privateKey' onClose={mock()} />)
  const privateKey = `0x${'a'.repeat(64)}`
  await view.user.type(screen.getByLabelText('Private key'), privateKey)
  await view.user.click(screen.getByRole('button', { name: 'Create account' }))
  expect(capability.importSigner.mock.calls.at(-1)?.[0]).toEqual({
    operationId: expect.any(String),
    source: 'private-key',
    privateKey,
    framePassword: '',
    accountName: 'Hot Account'
  })
})

it('resets the generated-seed copy timer and clears the active timer on unmount', async () => {
  const clearTimeoutSpy = spyOn(globalThis, 'clearTimeout')
  try {
    fixture.state.reset(walletState({}))
    capability = createAccountsCapabilityFake()
    capability.generateSeed.mockResolvedValue({ ok: true, phrase: 'one two three four' })
    const view = render(<AddAccount capability={capability} onClose={mock()} />)
    await view.user.click(screen.getByRole('button', { name: 'Create recovery phrase' }))
    await view.user.click(await screen.findByRole('button', { name: 'Copy recovery phrase' }))
    expect(screen.getByText('Copied')).toBeTruthy()
    const clearsAfterFirstCopy = clearTimeoutSpy.mock.calls.length

    await view.user.click(screen.getByRole('button', { name: 'Copy recovery phrase' }))
    expect(clearTimeoutSpy.mock.calls.length).toBe(clearsAfterFirstCopy + 1)
    const clearsAfterSecondCopy = clearTimeoutSpy.mock.calls.length
    view.unmount()
    expect(clearTimeoutSpy.mock.calls.length).toBe(clearsAfterSecondCopy + 1)
    expect(capability.writeClipboard.mock.calls.map(([input]) => input.text)).toEqual([
      'one two three four',
      'one two three four'
    ])
  } finally {
    clearTimeoutSpy.mockRestore()
  }
})

it('queries each stable hardware address key once and ignores the prior key result', async () => {
  const oldUsage = deferred<Awaited<ReturnType<AccountsCapabilityFake['inspectAddressChainUsage']>>>()
  const currentUsage = deferred<Awaited<ReturnType<AccountsCapabilityFake['inspectAddressChainUsage']>>>()
  const firstAddress = address('1')
  const secondAddress = address('2')
  capability = createAccountsCapabilityFake()
  capability.inspectAddressChainUsage
    .mockImplementationOnce(() => oldUsage.promise)
    .mockImplementationOnce(() => currentUsage.promise)
  let projectedState = walletState({
    signers: { 'ledger-1': signer('ledger-1', 'ledger', 'loading', [firstAddress]) }
  })
  fixture.state.reset(projectedState)
  render(
    <AddAccount
      capability={capability}
      initialSelectedSigner='ledger-1'
      initialType='ledger'
      onClose={mock()}
    />
  )
  await waitFor(() => expect(capability.inspectAddressChainUsage.mock.calls.length).toBe(1))
  act(() => fixture.state.reset(projectedState))
  await act(async () => {
    await Promise.resolve()
  })
  expect(capability.inspectAddressChainUsage.mock.calls).toHaveLength(1)

  projectedState = walletState({
    signers: { 'ledger-1': signer('ledger-1', 'ledger', 'loading', [secondAddress]) }
  })
  act(() => fixture.state.reset(projectedState))
  await waitFor(() => expect(capability.inspectAddressChainUsage.mock.calls.length).toBe(2))
  await act(async () => {
    currentUsage.resolve({
      ok: true,
      usage: [{ address: secondAddress, chainIds: [2], complete: true }]
    })
    await currentUsage.promise
  })
  expect(await screen.findByText('Used on Chain 2')).toBeTruthy()

  await act(async () => {
    oldUsage.resolve({
      ok: true,
      usage: [{ address: firstAddress, chainIds: [1], complete: true }]
    })
    await oldUsage.promise
  })
  expect(screen.getByText('Used on Chain 2')).toBeTruthy()
  expect(screen.queryByText('Checking chains')).toBeNull()
  expect(capability.inspectAddressChainUsage.mock.calls.map(([input]) => input.addresses)).toEqual([
    [firstAddress],
    [secondAddress]
  ])
})

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((next) => {
    resolve = next
  })
  return { promise, resolve }
}
