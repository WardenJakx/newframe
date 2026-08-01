import { expect, it, mock } from 'bun:test'
import type { Mock } from 'bun:test'

import type { OperationRecord } from '../../../../../domain/state/operation'
import { act, cleanup, render, screen, waitFor } from '../../../../../test/support/componentSetup'
import { createHostFixture } from '../../../../../test/support/rendererClient'
import { walletState } from '../../../../state/fixtures.test-support'
import { resetStateMirrorForTests } from '../../../../state/rendererStore'
import { AddAccount } from './AddAccount'

const link = createHostFixture()
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

const commands = (): Array<Record<string, any>> =>
  ((link.executeCommand as any).mock.calls as Array<[Record<string, any>]>).map(([command]) => command)
const lastCommand = (type: string): Record<string, any> => {
  const command = commands().findLast((candidate) => candidate.type === type)
  if (!command) throw new Error(`Missing ${type} command`)
  return command
}

it('keeps drafts local and follows projected onboarding and hardware session state across every add path', async () => {
  let state = walletState({})
  const reset = (overrides: Parameters<typeof walletState>[0] = {}) => {
    cleanup()
    ;(link.executeCommand as Mock<any>).mockReset().mockResolvedValue({ ok: true })
    ;(link.executeQuery as Mock<any>).mockReset().mockImplementation(async (query: any) => {
      if (query.type === 'security.status') {
        return {
          ok: true,
          locked: false,
          vaultExists: true,
          biometricUnlockEnabled: false,
          biometricAvailable: false,
          biometrics: { enabled: false, method: '', nativeAvailable: false }
        }
      }
      if (query.type === 'address.chain-usage') {
        return {
          ok: true,
          usage: query.addresses.map((entry: string) => ({
            address: entry,
            chainIds: [],
            complete: true
          }))
        }
      }
      if (query.type === 'keystore.locate') return { ok: true, keystore: { version: 3, crypto: {} } }
      if (query.type === 'seed.generate') return { ok: true, phrase: 'one two three four' }
      return { ok: false, error: 'not_found' }
    })
    state = walletState(overrides)
    resetStateMirrorForTests(state)
  }
  const publish = (operation: OperationRecord) => {
    state = { ...state, operations: { ...state.operations, [operation.id]: operation } }
    act(() => resetStateMirrorForTests(state))
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
  ;(link.executeCommand as Mock<any>).mockImplementation((command: Record<string, any>) =>
    command.type === 'account.watch-add' && command.addressOrName === 'old.eth'
      ? new Promise((resolve) => {
          resolveStaleAcknowledgement = resolve
        })
      : Promise.resolve({ ok: true })
  )
  const closeWatch = mock()
  let view = render(<AddAccount initialType='watch' onClose={closeWatch} />)
  await view.user.type(screen.getByLabelText('Address or gns/ens name'), 'old.eth')
  await view.user.click(screen.getByRole('button', { name: 'Create account' }))
  const staleWatch = lastCommand('account.watch-add')
  await view.user.clear(screen.getByLabelText('Address or gns/ens name'))
  await view.user.type(screen.getByLabelText('Address or gns/ens name'), address('2'))
  await view.user.click(screen.getByRole('button', { name: 'Create account' }))
  const currentWatch = lastCommand('account.watch-add')
  expect(currentWatch).toEqual({
    type: 'account.watch-add',
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
  view = render(<AddAccount initialType='keystore' onClose={mock()} />)
  await view.user.click(screen.getByRole('button', { name: 'Choose JSON backup file' }))
  await view.user.type(screen.getByLabelText('JSON backup file password'), 'file-secret')
  await view.user.click(screen.getByRole('button', { name: 'Create account' }))
  expect(lastCommand('signer.import')).toEqual({
    type: 'signer.import',
    operationId: expect.any(String),
    source: 'keystore',
    keystore: { version: 3, crypto: {} },
    keystorePassword: 'file-secret',
    framePassword: '',
    accountName: 'Hot Account'
  })
  expect((link.executeQuery as Mock<any>).mock.calls.map(([query]) => query)).toContainEqual({
    type: 'keystore.locate'
  })

  reset()
  view = render(<AddAccount onClose={mock()} />)
  await view.user.click(screen.getByRole('button', { name: 'Create recovery phrase' }))
  expect(await screen.findByText('one')).toBeTruthy()
  await view.user.click(screen.getByRole('button', { name: 'Recovery phrase saved' }))
  await view.user.click(screen.getByRole('button', { name: 'Create account' }))
  expect(lastCommand('signer.import')).toEqual({
    type: 'signer.import',
    operationId: expect.any(String),
    source: 'phrase',
    phrase: 'one two three four',
    framePassword: '',
    accountName: 'Hot Account'
  })

  reset({ signers: { 'seed-1': signer('seed-1', 'seed', 'ok', [address('1')]) } })
  view = render(<AddAccount onClose={mock()} />)
  await view.user.click(screen.getByRole('button', { name: 'Add from stored recovery phrases' }))
  await view.user.click(screen.getByRole('button', { name: 'Add address' }))
  await view.user.click(screen.getByRole('button', { name: 'Add Wallet 1' }))
  expect(lastCommand('account.add-from-signer')).toEqual({
    type: 'account.add-from-signer',
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
  view = render(<AddAccount initialSelectedSigner='ledger-1' initialType='ledger' onClose={mock()} />)
  await waitFor(() =>
    expect(commands().some(({ type }) => type === 'signer.hardware-session-start')).toBe(true)
  )
  await view.user.click(screen.getByRole('button', { name: 'Next account page' }))
  expect(lastCommand('signer.ledger-accounts-load')).toEqual({
    type: 'signer.ledger-accounts-load',
    operationId: expect.any(String),
    signerId: 'ledger-1',
    accountCount: 10
  })

  reset({ signers: { 'lattice-1': signer('lattice-1', 'lattice', 'pair') } })
  view = render(<AddAccount initialSelectedSigner='lattice-1' initialType='lattice' onClose={mock()} />)
  await waitFor(() =>
    expect(commands().some(({ type }) => type === 'signer.hardware-session-start')).toBe(true)
  )
  const latticeSession = lastCommand('signer.hardware-session-start')
  await view.user.type(screen.getByLabelText('GridPlus pairing code'), 'pair-secret')
  await view.user.click(screen.getByRole('button', { name: 'Pair' }))
  const latticePair = lastCommand('signer.lattice-pair')
  expect(latticePair).toEqual({
    type: 'signer.lattice-pair',
    operationId: latticeSession.operationId,
    actionId: expect.any(String),
    signerId: 'lattice-1',
    pairCode: 'PAIR-SECRET'
  })
  expect(screen.queryByText('GridPlus paired')).toBeNull()
  publish(operation(latticePair.actionId, 'signer.lattice-pair', 'succeeded'))
  expect(await screen.findByText('GridPlus paired')).toBeTruthy()

  reset({ signers: { 'trezor-1': signer('trezor-1', 'trezor', 'need pin') } })
  view = render(<AddAccount initialSelectedSigner='trezor-1' initialType='trezor' onClose={mock()} />)
  await waitFor(() =>
    expect(commands().some(({ type }) => type === 'signer.hardware-session-start')).toBe(true)
  )
  const trezorSession = lastCommand('signer.hardware-session-start')
  await view.user.click(screen.getByRole('button', { name: 'PIN position 1' }))
  await view.user.click(screen.getByRole('button', { name: 'Submit Trezor PIN' }))
  expect(lastCommand('signer.trezor-input')).toEqual({
    type: 'signer.trezor-input',
    operationId: trezorSession.operationId,
    actionId: expect.any(String),
    signerId: 'trezor-1',
    input: 'pin',
    value: '1'
  })
  await view.user.click(screen.getByRole('button', { name: 'Back' }))
  expect(commands()).toContainEqual({
    type: 'signer.hardware-session-finish',
    operationId: trezorSession.operationId,
    signerId: 'trezor-1',
    outcome: 'cancelled'
  })
  expect(commands().some(({ type }) => type === 'signer.disconnect')).toBe(false)
}, 2_000)
