import { afterEach, expect, it, mock } from 'bun:test'

import { Wallet } from 'ethers'
import { subscribeWithSelector } from 'zustand/middleware'
import { createStore } from 'zustand/vanilla'

import { createTestStore } from '../../../../test/support/createTestStore'
import type { SafeApprovalCommand, SafeConfirmationStatusQuery } from '../../../app/contracts/operations'
import { createOperationService } from '../../../platform/operations/service'
import { getSafeTypedMessage, verifySafeHash } from '../../../platform/safe/integrity'
import type { SigningApprovalContext, SigningUiContext } from '../../../platform/signing/signers/Signer'
import type { TypedMessage } from '../../requests/contract/requests'
import type { SafeProposal } from '../domain/safe'
import { createSafeConfirmationService, type SafeConfirmationPorts } from './safeConfirmation'

const safeAddress = '0x1111111111111111111111111111111111111111'
const wallet = new Wallet(`0x${'23'.repeat(32)}`)
const ownerId = wallet.address.toLowerCase()
const zero = '0x0000000000000000000000000000000000000000'
const disposals: (() => void)[] = []
afterEach(() => disposals.splice(0).forEach((dispose) => dispose()))
async function until(condition: () => boolean) {
  for (let n = 0; n < 200; n++) {
    if (condition()) {
      return
    }
    await Bun.sleep(2)
  }
  throw new Error('Timed out')
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}
function setup() {
  const proposal: SafeProposal = {
    safe: safeAddress,
    safeTxHash: `0x${'0'.repeat(64)}`,
    nonce: '7',
    to: wallet.address,
    value: '12345678901234567890',
    operation: 1,
    data: '0xaabb',
    safeTxGas: '987',
    baseGas: '654',
    gasPrice: '321',
    gasToken: wallet.address,
    refundReceiver: safeAddress,
    confirmations: []
  }
  proposal.safeTxHash = verifySafeHash(proposal, 1, safeAddress, '1.4.1').computedHash!
  const base = createTestStore()
  const selected = createStore(subscribeWithSelector(() => base.getState()))
  base.store.subscribe((state) => selected.setState(state, true))
  const store = { ...base.store, subscribe: selected.subscribe }
  store.getState().upsertAccount({
    id: safeAddress,
    address: safeAddress,
    created: 'safe:1',
    safe: {
      '1': {
        chainId: 1,
        address: safeAddress,
        configuration: {
          owners: [wallet.address],
          threshold: 1,
          nonce: '5',
          version: '1.4.1'
        },
        pending: [proposal]
      }
    }
  })
  store.getState().upsertAccount({
    id: ownerId,
    address: wallet.address,
    signer: 'seed',
    lastSignerType: 'Seed',
    created: 'owner:1'
  })
  store.setState((state) => ({
    main: {
      ...state.main,
      currentAccount: safeAddress,
      appLock: { ...state.main.appLock, locked: false },
      networks: {
        ...state.main.networks,
        ethereum: { ...state.main.networks.ethereum, 1: { ...state.main.networks.ethereum[1], on: true } }
      }
    }
  }))
  const operations = createOperationService({ store, clock: { now: Date.now } })
  const signature = wallet.signingKey.sign(proposal.safeTxHash).serialized
  let stored: { owner: string; signature: string }[] = []
  const signing = {
    sign: mock(async (_message: TypedMessage, _context?: SigningApprovalContext) => signature)
  }
  const client = {
    confirmations: mock(async () => stored),
    confirm: mock(async (_chainId: number, _hash: string, value: string) => {
      stored = [{ owner: wallet.address, signature: value }]
    })
  }
  const accounts: SafeConfirmationPorts['accounts'] = {
    getFrameAccount: () => ({
      signTypedData(message, callback, context) {
        void signing.sign(message, context).then(
          (signature) => callback(null, signature),
          (error: unknown) => callback(error as Error)
        )
      }
    })
  }
  const service = createSafeConfirmationService({ store, operations, accounts, client })
  disposals.push(service.dispose)
  let active = true
  const listeners = new Set<() => void>()
  const context: SigningUiContext = {
    owner: { clientType: 'wallet-ui', windowInstanceId: 'window' },
    isOwnerActive: () => active,
    subscribeOwnerDisposed(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    }
  }
  const command: SafeApprovalCommand = {
    type: 'request.approve',
    operationId: 'confirm-1',
    accountId: safeAddress,
    ownerId,
    chainId: 1,
    safeTxHash: proposal.safeTxHash
  }
  const query: SafeConfirmationStatusQuery = {
    type: 'safe.confirmation-status',
    accountId: safeAddress,
    ownerId,
    chainId: 1,
    safeTxHash: proposal.safeTxHash
  }
  return {
    store,
    service,
    operations,
    signing,
    client,
    context,
    command,
    query,
    proposal,
    signature,
    status: () => service.confirmationStatus(query),
    setStored: (value: typeof stored) => {
      stored = value
    },
    closeWindow: () => {
      active = false
      for (const listener of listeners) {
        listener()
      }
    }
  }
}

it('signs exact canonical fields for a future nonce without changing selected Safe, then verifies stored bytes', async () => {
  const test = setup()
  expect(test.service.confirm(test.command, test.context)).toBe(true)
  await until(() => test.status().status === 'published')
  expect(test.signing.sign.mock.calls[0] as unknown[]).toEqual([
    getSafeTypedMessage(test.proposal, 1, safeAddress, '1.4.1'),
    expect.objectContaining({
      requestId: test.command.operationId,
      chainId: 1,
      signal: expect.any(AbortSignal),
      ui: test.context,
      isActive: expect.any(Function)
    })
  ])
  expect(test.client.confirm).toHaveBeenCalledWith(
    1,
    test.proposal.safeTxHash,
    test.signature,
    expect.any(AbortSignal)
  )
  expect(test.client.confirmations).toHaveBeenCalledTimes(2)
  expect(test.store.getState().main.currentAccount).toBe(safeAddress)
  expect(test.store.getState().main.accounts[safeAddress].safe!['1'].pending![0].confirmations).toEqual([
    wallet.address
  ])
})

it('coalesces clicks and projects progress to every approving window; conflicting ids reject', async () => {
  const test = setup()
  const pending = deferred<string>()
  test.signing.sign.mockImplementation(() => pending.promise)
  test.service.confirm(test.command, test.context)
  await until(() => test.status().status === 'signing')
  const second = { ...test.context, owner: { ...test.context.owner, windowInstanceId: 'second' } }
  expect(test.service.confirm({ ...test.command, operationId: 'confirm-2' }, second)).toBe(true)
  expect(test.service.confirm({ ...test.command, ownerId: zero }, test.context)).toBe(false)
  expect(test.service.confirmationStatus(test.query, second.owner).operationId).toBe('confirm-2')
  pending.resolve(test.signature)
  await until(() => test.status().status === 'published')
  expect(test.signing.sign).toHaveBeenCalledTimes(1)
  expect(test.client.confirm).toHaveBeenCalledTimes(1)
  expect(
    test.operations.lookup({ id: 'confirm-2', owner: second.owner, type: 'account.safe-confirm' })?.phase
  ).toBe('published')
})

it('reconciles existing valid ETH_SIGN bytes before prompting, ignoring invalid duplicates and address-only claims', async () => {
  const test = setup()
  const personal = await wallet.signMessage(Buffer.from(test.proposal.safeTxHash.slice(2), 'hex'))
  const ethSign = `${personal.slice(0, -2)}${(parseInt(personal.slice(-2), 16) + 4).toString(16)}`
  test.setStored([
    { owner: wallet.address, signature: '0xgarbage' },
    { owner: wallet.address, signature: ethSign }
  ])
  test.service.confirm(test.command, test.context)
  await until(() => test.status().status === 'published')
  expect(test.signing.sign).not.toHaveBeenCalled()
  expect(test.client.confirm).not.toHaveBeenCalled()
})

it('keeps completed signing across uncertain publication and retries without an attached signer', async () => {
  const test = setup()
  test.client.confirm.mockRejectedValueOnce(new Error('timeout'))
  test.service.confirm(test.command, test.context)
  await until(() => test.status().status === 'publication_failed')
  expect(test.client.confirmations).toHaveBeenCalledTimes(2)
  test.store.getState().patchAccount(ownerId, { signer: '' })
  test.signing.sign.mockRejectedValue(new Error('No signer attached'))
  test.service.confirm({ ...test.command, operationId: 'retry' }, test.context)
  await until(() => test.status().status === 'published')
  expect(test.signing.sign).toHaveBeenCalledTimes(1)
  expect(test.client.confirm).toHaveBeenCalledTimes(2)
})

it('does not trust POST success with invalid first-write-wins bytes, but accepts stored valid bytes after a failed POST', async () => {
  const test = setup()
  test.client.confirm.mockImplementationOnce(async () => {
    test.setStored([{ owner: wallet.address, signature: '0xbad' }])
  })
  test.service.confirm(test.command, test.context)
  await until(() => test.status().status === 'publication_failed')
  test.client.confirm.mockImplementationOnce(async () => {
    test.setStored([{ owner: wallet.address, signature: test.signature }])
    throw new Error('connection dropped')
  })
  test.service.confirm({ ...test.command, operationId: 'retry' }, test.context)
  await until(() => test.status().status === 'published')
  expect(test.signing.sign).toHaveBeenCalledTimes(1)
})

it.each(['tampered', 'missing-field', 'domain', 'foreign-owner', 'foreign-profile', 'old-nonce'] as const)(
  'rejects %s canonical state before signing or publishing',
  async (kind) => {
    const test = setup()
    const account = test.store.getState().main.accounts[safeAddress]
    const deployment = structuredClone(account.safe!['1'])
    if (kind === 'tampered') {
      deployment.pending![0].value = '999'
    }
    if (kind === 'missing-field') {
      delete deployment.pending![0].baseGas
    }
    if (kind === 'domain') {
      deployment.configuration.version = '0.0.0'
    }
    if (kind === 'foreign-owner') {
      deployment.configuration.owners = [zero]
    }
    if (kind === 'old-nonce') {
      deployment.configuration.nonce = '8'
    }
    test.store.getState().patchAccount(safeAddress, { safe: { '1': deployment } })
    if (kind === 'foreign-profile') {
      test.store.setState((state) => ({
        main: {
          ...state.main,
          accounts: {
            ...state.main.accounts,
            [ownerId]: { ...state.main.accounts[ownerId], profileId: 'other' }
          }
        }
      }))
    }
    test.service.confirm(test.command, test.context)
    expect(test.status().status).toBe('validation_failed')
    expect(test.signing.sign).not.toHaveBeenCalled()
    expect(test.client.confirm).not.toHaveBeenCalled()
  }
)

it.each(['selection', 'proposal', 'membership', 'network', 'dispose'] as const)(
  'cancels pending signing on %s and ignores a late hardware result',
  async (kind) => {
    const test = setup()
    const pending = deferred<string>()
    test.signing.sign.mockImplementation(() => pending.promise)
    test.service.confirm(test.command, test.context)
    await until(() => test.status().status === 'signing')
    if (kind === 'selection') {
      test.store.setState((state) => ({ main: { ...state.main, currentAccount: ownerId } }))
    }
    if (kind === 'proposal' || kind === 'membership') {
      const deployment = structuredClone(test.store.getState().main.accounts[safeAddress].safe!['1'])
      if (kind === 'proposal') {
        deployment.pending![0].data = '0xcc'
      } else {
        deployment.configuration.owners = [zero]
      }
      test.store.getState().patchAccount(safeAddress, { safe: { '1': deployment } })
    }
    if (kind === 'network') {
      test.store.setState((state) => ({
        main: { ...state.main, networks: { ...state.main.networks, ethereum: {} } }
      }))
    }
    if (kind === 'dispose') {
      test.service.dispose()
    }
    pending.resolve(test.signature)
    await until(
      () =>
        test.operations.lookup({
          id: test.command.operationId,
          type: 'account.safe-confirm',
          owner: test.context.owner
        })?.phase === 'cancelled'
    )
    expect(test.client.confirm).not.toHaveBeenCalled()
  }
)

it('reports owner cancellation or invalid signing without publication', async () => {
  const test = setup()
  test.signing.sign.mockRejectedValueOnce(new Error('Sign request rejected by user'))
  test.service.confirm(test.command, test.context)
  await until(() => test.status().status === 'cancelled')
  test.signing.sign.mockResolvedValueOnce(`0x${'0'.repeat(130)}`)
  test.service.confirm({ ...test.command, operationId: 'retry' }, test.context)
  await until(() => test.status().status === 'signing_failed')
  expect(test.client.confirm).not.toHaveBeenCalled()
})

it('does not claim a publication retry when the initial service read failed before signing', async () => {
  const test = setup()
  test.client.confirmations.mockRejectedValueOnce(new Error('offline'))
  test.service.confirm(test.command, test.context)
  await until(() => test.status().status === 'signing_failed')
  expect(test.status().message).toContain('No signing was requested')
  expect(test.signing.sign).not.toHaveBeenCalled()
  expect(test.client.confirm).not.toHaveBeenCalled()
})

it('retains failed publication for an unchanged proposal across review closure and wallet lock', async () => {
  const test = setup()
  test.client.confirm.mockRejectedValueOnce(new Error('offline'))
  test.service.confirm(test.command, test.context)
  await until(() => test.status().status === 'publication_failed')
  test.closeWindow()
  test.store.setState((state) => ({
    main: { ...state.main, currentAccount: ownerId, appLock: { ...state.main.appLock, locked: true } }
  }))
  expect(test.status().status).toBe('publication_failed')
  test.store.setState((state) => ({
    main: { ...state.main, currentAccount: safeAddress, appLock: { ...state.main.appLock, locked: false } }
  }))
  const context = {
    ...test.context,
    owner: { ...test.context.owner, windowInstanceId: 'reopened' },
    isOwnerActive: () => true
  }
  test.service.confirm({ ...test.command, operationId: 'retry' }, context)
  await until(() => test.status().status === 'published')
  expect(test.signing.sign).toHaveBeenCalledTimes(1)
})

it('cancels pending publication when cached owner membership changes and drops the retry material', async () => {
  const test = setup()
  const pending = deferred<void>()
  test.client.confirm.mockImplementationOnce(() => pending.promise)
  test.service.confirm(test.command, test.context)
  await until(() => test.client.confirm.mock.calls.length === 1)
  const deployment = structuredClone(test.store.getState().main.accounts[safeAddress].safe!['1'])
  deployment.configuration.owners = [zero]
  test.store.getState().patchAccount(safeAddress, { safe: { '1': deployment } })
  pending.resolve()
  await until(() => test.status().status === 'cancelled')
  expect(test.client.confirmations).toHaveBeenCalledTimes(1)
  test.store.getState().patchAccount(safeAddress, {
    safe: {
      '1': {
        ...deployment,
        configuration: { ...deployment.configuration, owners: [wallet.address] }
      }
    }
  })
  test.service.confirm({ ...test.command, operationId: 'retry' }, test.context)
  await until(() => test.status().status === 'published')
  expect(test.signing.sign).toHaveBeenCalledTimes(2)
})

it.each(['selection', 'lock', 'window'] as const)(
  'retains completed signing when publication is interrupted by %s, then retries disconnected',
  async (kind) => {
    const test = setup()
    const pending = deferred<void>()
    test.client.confirm.mockImplementationOnce(() => pending.promise)
    test.service.confirm(test.command, test.context)
    await until(() => test.client.confirm.mock.calls.length === 1)
    if (kind === 'selection') {
      test.store.setState((state) => ({ main: { ...state.main, currentAccount: ownerId } }))
    }
    if (kind === 'lock') {
      test.store.setState((state) => ({
        main: { ...state.main, appLock: { ...state.main.appLock, locked: true } }
      }))
    }
    if (kind === 'window') {
      test.closeWindow()
    }
    await until(() => test.status().status === 'publication_failed')
    expect(test.status().message).toContain('saved confirmation')
    pending.resolve()
    test.store.getState().patchAccount(ownerId, { signer: '' })
    test.store.setState((state) => ({
      main: { ...state.main, currentAccount: safeAddress, appLock: { ...state.main.appLock, locked: false } }
    }))
    const context = { ...test.context, isOwnerActive: () => true }
    test.service.confirm({ ...test.command, operationId: 'retry' }, context)
    await until(() => test.status().status === 'published')
    expect(test.signing.sign).toHaveBeenCalledTimes(1)
  }
)
