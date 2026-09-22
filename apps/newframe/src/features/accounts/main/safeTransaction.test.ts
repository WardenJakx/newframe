import { afterEach, expect, it, mock } from 'bun:test'

import { Interface, Wallet, ZeroAddress } from 'ethers'

import { createTestStore } from '../../../../test/support/createTestStore'
import { createOperationService } from '../../../platform/operations/service'
import { getSafeTypedMessage, packSafeSignatures } from '../../../platform/safe/integrity'
import type { SigningUiContext } from '../../../platform/signing/signers/Signer'
import { GasFeesSource } from '../../transactions/domain'
import type { SafeProposal } from '../domain/safe'
import { createSafeTransactionService, type SafeTransactionPorts } from './safeTransaction'

const safe = '0x1111111111111111111111111111111111111111'
const recipient = '0x2222222222222222222222222222222222222222'
const owners = [new Wallet(`0x${'31'.repeat(32)}`), new Wallet(`0x${'32'.repeat(32)}`)]
const disposals: Array<() => void> = []
afterEach(() => disposals.splice(0).forEach((dispose) => dispose()))

async function until(condition: () => boolean) {
  for (let index = 0; index < 200; index++) {
    if (condition()) {
      return
    }
    await Bun.sleep(2)
  }
  throw new Error('Timed out')
}

function fixture(threshold = 2, attachedOwners = 2) {
  const { store } = createTestStore()
  let configuration = {
    owners: owners.map(({ address }) => address),
    threshold,
    nonce: '0',
    version: '1.4.1'
  }
  store.getState().upsertAccount({
    id: safe,
    address: safe,
    created: 'safe:1',
    safe: { '1': { chainId: 1, address: safe, configuration: structuredClone(configuration), pending: [] } }
  })
  const signing = owners.map((wallet, index) => {
    const accountId = wallet.address.toLowerCase()
    store.getState().upsertAccount({
      id: accountId,
      address: wallet.address,
      signer: index < attachedOwners ? `signer-${index}` : '',
      lastSignerType: index < attachedOwners ? 'Seed' : 'Address',
      created: `owner:${index}`
    })
    if (index < attachedOwners) {
      store.getState().updateSigner({
        id: `signer-${index}`,
        name: `Signer ${index}`,
        type: 'seed',
        model: '',
        status: 'ok',
        addresses: [wallet.address],
        appVersion: { major: 1, minor: 0, patch: 0 }
      })
    }
    return mock(async (proposal: SafeProposal) => wallet.signingKey.sign(proposal.safeTxHash).serialized)
  })
  store.setState((state) => ({
    main: {
      ...state.main,
      currentAccount: safe,
      appLock: { ...state.main.appLock, locked: false }
    }
  }))
  const proposalWrites = { propose: mock(() => undefined), confirm: mock(() => undefined) }
  let remoteConfirmations: Array<{ owner: string; signature: string }> = []
  const provider = {
    prepare: mock(async (_executorId: string, transaction: RPC.SendTransaction.TxParams) => {
      if (!transaction.to) {
        throw new Error('Missing Safe target')
      }
      return {
        transaction: {
          chainId: transaction.chainId,
          type: '0x2',
          gasFeesSource: GasFeesSource.Frame,
          from: owners[0].address,
          to: transaction.to,
          value: transaction.value ?? '0x0',
          data: transaction.data ?? '0x',
          nonce: '0x0',
          gasLimit: '0x5208',
          maxFeePerGas: '0x2',
          maxPriorityFeePerGas: '0x1'
        },
        warnings: []
      }
    }),
    execute: mock(async () => `0x${'ab'.repeat(32)}`)
  } satisfies SafeTransactionPorts['provider']
  const submitted = mock(() => undefined)
  const operations = createOperationService({ store, clock: { now: Date.now } })
  const propose = mock(
    async (_chainId: number, proposal: SafeProposal, confirmation: { owner?: string; signature: string }) => {
      proposalWrites.propose()
      if (!confirmation.owner) {
        throw new Error('Missing confirmation owner')
      }
      remoteConfirmations = [{ owner: confirmation.owner, signature: confirmation.signature }]
      return proposal
    }
  )
  const transaction = mock(async () => {
    const deployment = store.getState().main.accounts[safe].safe!['1']
    const proposal = deployment.pending![0]
    return { ...proposal, confirmations: remoteConfirmations.map(({ owner }) => owner) }
  })
  const confirm = mock(async (_chainId: number, _hash: string, signature: string) => {
    proposalWrites.confirm()
    remoteConfirmations.push({ owner: owners[0].address, signature })
  })
  const client: SafeTransactionPorts['client'] = {
    configuration: mock(async () => structuredClone(configuration)),
    propose,
    transaction,
    confirmations: mock(async () => remoteConfirmations),
    confirm
  }
  const accounts: SafeTransactionPorts['accounts'] = {
    getFrameAccount(id) {
      const index = owners.findIndex(({ address }) => address.toLowerCase() === id.toLowerCase())
      if (index < 0) {
        return null
      }
      return {
        signTypedData(message, callback) {
          const proposal = store.getState().main.accounts[safe].safe!['1'].pending![0]
          void signing[index](proposal).then((signature) => callback(null, signature))
          expect(message).toEqual(getSafeTypedMessage(proposal, 1, safe, configuration.version))
        }
      }
    }
  }
  const service = createSafeTransactionService({ store, operations, accounts, client, provider, submitted })
  disposals.push(() => service.dispose())
  const draft = service.prepareDraft({ accountId: safe, chainId: 1, to: recipient, data: '0xaabb' })
  service.attach(draft, 'request-1')
  let active = true
  const context: SigningUiContext = {
    owner: { clientType: 'wallet-ui', windowInstanceId: 'window' },
    isOwnerActive: () => active,
    subscribeOwnerDisposed: () => () => undefined
  }
  const command = (ownerIndex: number, operationId = `approve-${ownerIndex}`) => ({
    type: 'request.approve' as const,
    operationId,
    accountId: safe,
    chainId: 1,
    safeTxHash: draft.proposal.safeTxHash,
    ownerId: owners[ownerIndex].address
  })
  const query = { ...command(0), type: 'safe.confirmation-status' as const }
  return {
    store,
    service,
    operations,
    accounts,
    signing,
    client,
    propose,
    transaction,
    confirm,
    provider,
    submitted,
    proposalWrites,
    context,
    command,
    query,
    draft,
    configuration,
    setNonce: (nonce: string) => {
      configuration = { ...configuration, nonce }
    },
    setRemote: (value: typeof remoteConfirmations) => {
      remoteConfirmations = value
    },
    close: () => {
      active = false
    }
  }
}

it('signs exactly one selected owner and keeps a locally satisfiable Safe off the service', async () => {
  const test = fixture(2, 2)
  expect(test.service.approve(test.command(0), test.context)).toBeTrue()
  await until(() => ['local', 'ready'].includes(test.service.status(test.query).status))
  const proposal = test.store.getState().main.accounts[safe].safe!['1'].pending![0]
  expect(proposal.local?.confirmations).toHaveLength(1)
  expect(proposal.local?.confirmations[0].owner).toBe(owners[0].address)
  expect(test.signing[0]).toHaveBeenCalledTimes(1)
  expect(test.signing[1]).not.toHaveBeenCalled()
  expect(test.propose).not.toHaveBeenCalled()
  expect(test.confirm).not.toHaveBeenCalled()
  expect(test.store.getState().main.currentAccount).toBe(safe)
})

it('keeps service coordination off when an attached owner is temporarily unavailable', async () => {
  const test = fixture(2, 2)
  test.store.setState((state) => ({
    main: {
      ...state.main,
      signers: {
        ...state.main.signers,
        'signer-1': { ...state.main.signers['signer-1'], status: 'disconnected' }
      }
    }
  }))
  expect(test.service.approve(test.command(0), test.context)).toBeTrue()
  await until(() => test.service.status(test.query).status === 'local')
  expect(test.propose).not.toHaveBeenCalled()
  expect(test.confirm).not.toHaveBeenCalled()
})

it('still requires the selected attached owner to be ready before signing', async () => {
  const test = fixture(2, 2)
  test.store.setState((state) => ({
    main: {
      ...state.main,
      signers: {
        ...state.main.signers,
        'signer-1': { ...state.main.signers['signer-1'], status: 'disconnected' }
      }
    }
  }))
  expect(test.service.approve(test.command(1), test.context)).toBeTrue()
  await until(() => test.service.status(test.query).status === 'validation_failed')
  expect(test.signing[1]).not.toHaveBeenCalled()
  expect(test.propose).not.toHaveBeenCalled()
})

it('retains a local signature across ambiguous remote publication and retries without signing again', async () => {
  const test = fixture(2, 1)
  test.propose.mockRejectedValueOnce(new Error('timeout'))
  test.transaction.mockRejectedValueOnce(new Error('not found'))
  test.service.approve(test.command(0), test.context)
  await until(() => test.service.status(test.query).status === 'publication_failed')
  expect(test.store.getState().main.accounts[safe].safe!['1'].pending![0].local?.confirmations).toHaveLength(
    1
  )
  test.service.approve(test.command(0, 'retry'), test.context)
  await until(() => test.service.status(test.query).status === 'published')
  expect(test.signing[0]).toHaveBeenCalledTimes(1)
  expect(test.propose).toHaveBeenCalledTimes(2)
})

it('packs exact sorted confirmations, prepares a nonselected executor, and broadcasts once', async () => {
  const test = fixture(2, 2)
  test.service.approve(test.command(0), test.context)
  await until(() => test.service.status(test.query).status === 'local')
  test.service.approve(test.command(1), test.context)
  await until(() => test.service.status(test.query).status === 'ready')
  const prepared = await test.service.prepareExecution(test.query, owners[0].address.toLowerCase())
  const proposal = test.store.getState().main.accounts[safe].safe!['1'].pending![0]
  const packed = packSafeSignatures(
    proposal.safeTxHash,
    test.configuration.owners,
    proposal.local!.confirmations
  )
  const abi = new Interface([
    'function execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes)'
  ])
  expect(prepared.transaction.data).toBe(
    abi.encodeFunctionData('execTransaction', [
      proposal.to,
      proposal.value,
      proposal.data,
      proposal.operation,
      proposal.safeTxGas,
      proposal.baseGas,
      proposal.gasPrice,
      proposal.gasToken ?? ZeroAddress,
      proposal.refundReceiver ?? ZeroAddress,
      packed
    ])
  )
  const hash = await test.service.execute(
    test.query,
    owners[0].address.toLowerCase(),
    undefined,
    test.context,
    'execute-1'
  )
  expect(hash).toBe(`0x${'ab'.repeat(32)}`)
  expect(test.provider.execute).toHaveBeenCalledTimes(1)
  expect(test.submitted).toHaveBeenCalledWith({ safeTxHash: proposal.safeTxHash, outerTxHash: hash })
  expect(
    await test.service.execute(
      test.query,
      owners[0].address.toLowerCase(),
      undefined,
      test.context,
      'execute-2'
    )
  ).toBe(hash)
  expect(test.provider.execute).toHaveBeenCalledTimes(1)
  expect(test.store.getState().main.currentAccount).toBe(safe)
})

it('requires a fresh reviewed executor transaction after execution fails', async () => {
  const test = fixture(1, 1)
  test.service.approve(test.command(0), test.context)
  await until(() => test.service.status(test.query).status === 'ready')

  await test.service.prepareExecution(test.query, owners[0].address.toLowerCase())
  test.provider.execute.mockRejectedValueOnce(new Error('Executor rejected transaction.'))
  const failedExecution = test.service.execute(
    test.query,
    owners[0].address.toLowerCase(),
    undefined,
    test.context,
    'execute-failed'
  )
  expect(failedExecution).rejects.toThrow('Executor rejected transaction.')
  await failedExecution.catch(() => undefined)
  expect(test.store.getState().main.accounts[safe].safe!['1'].pending![0].local?.execution.status).toBe(
    'failed'
  )

  expect(() =>
    test.service.execute(
      test.query,
      owners[0].address.toLowerCase(),
      undefined,
      test.context,
      'execute-without-review'
    )
  ).toThrow('Prepare and review')
  expect(test.provider.execute).toHaveBeenCalledTimes(1)

  await test.service.prepareExecution(test.query, owners[0].address.toLowerCase())
  expect(test.provider.prepare).toHaveBeenCalledTimes(2)
  expect(test.store.getState().main.accounts[safe].safe!['1'].pending![0].local?.execution.status).toBe(
    'ready'
  )

  const hash = await test.service.execute(
    test.query,
    owners[0].address.toLowerCase(),
    undefined,
    test.context,
    'execute-retried'
  )
  expect(hash).toBe(`0x${'ab'.repeat(32)}`)
  expect(test.provider.execute).toHaveBeenCalledTimes(2)
})

it('refuses new work after disposal and suppresses notification when an in-flight broadcast completes', async () => {
  const test = fixture(1, 1)
  const executorId = owners[0].address.toLowerCase()
  test.service.approve(test.command(0), test.context)
  await until(() => test.service.status(test.query).status === 'ready')
  await test.service.prepareExecution(test.query, executorId)

  const broadcast = Promise.withResolvers<string>()
  test.provider.execute.mockImplementationOnce(() => broadcast.promise)
  const execution = test.service.execute(test.query, executorId, undefined, test.context, 'execute-late')
  await until(() => test.provider.execute.mock.calls.length === 1)
  test.service.dispose()

  expect(() => test.service.prepareDraft({ accountId: safe, chainId: 1, to: recipient })).toThrow(
    'unavailable'
  )
  expect(() => test.service.attach(test.draft, 'request-after-disposal')).toThrow('unavailable')
  expect(test.service.approve(test.command(0, 'approve-after-disposal'), test.context)).toBeFalse()
  expect(() => test.service.removeUnsigned(test.query)).toThrow('unavailable')
  test.service.cleanupUnsigned(new Set())
  expect(test.service.prepareExecution(test.query, executorId)).rejects.toThrow('unavailable')
  expect(
    test.service.execute(test.query, executorId, undefined, test.context, 'execute-after-disposal')
  ).rejects.toThrow('unavailable')
  expect(() => test.service.status(test.query)).toThrow('unavailable')

  const hash = `0x${'ab'.repeat(32)}`
  broadcast.resolve(hash)
  expect(await execution).toBe(hash)
  expect(test.submitted).not.toHaveBeenCalled()
  expect(test.provider.prepare).toHaveBeenCalledTimes(1)
  expect(test.provider.execute).toHaveBeenCalledTimes(1)
  expect(test.store.getState().main.accounts[safe].safe!['1'].pending![0].local).toMatchObject({
    requestId: 'request-1',
    execution: { status: 'submitted', transactionHash: hash }
  })
})

it('removes only orphaned unsigned drafts during startup reconciliation', () => {
  const test = fixture(1, 1)
  test.service.cleanupUnsigned(new Set())
  expect(test.store.getState().main.accounts[safe].safe!['1'].pending).toEqual([])
})

it('refuses stale onchain nonce before owner signing', async () => {
  const test = fixture(1, 1)
  test.setNonce('1')
  test.service.approve(test.command(0), test.context)
  await until(() => test.service.status(test.query).status === 'validation_failed')
  expect(test.signing[0]).not.toHaveBeenCalled()
  expect(test.propose).not.toHaveBeenCalled()
})

it('refuses execution when onchain state changes after review', async () => {
  const test = fixture(1, 1)
  test.service.approve(test.command(0), test.context)
  await until(() => test.service.status(test.query).status === 'ready')
  await test.service.prepareExecution(test.query, owners[0].address.toLowerCase())
  test.setNonce('1')
  expect(
    test.service.execute(
      test.query,
      owners[0].address.toLowerCase(),
      undefined,
      test.context,
      'execute-stale'
    )
  ).rejects.toThrow('stale')
  expect(test.provider.execute).not.toHaveBeenCalled()
})

it('rehydrates persisted verified confirmations as ready after restart', async () => {
  const test = fixture(1, 1)
  test.service.approve(test.command(0), test.context)
  await until(() => test.service.status(test.query).status === 'ready')
  test.service.dispose()

  const restarted = createSafeTransactionService({
    store: test.store,
    operations: test.operations,
    accounts: test.accounts,
    client: test.client,
    provider: test.provider,
    submitted: test.submitted
  })
  disposals.push(() => restarted.dispose())

  expect(restarted.status(test.query).status).toBe('ready')
  const prepared = await Promise.resolve(
    restarted.prepareExecution(test.query, owners[0].address.toLowerCase())
  )
  expect(prepared).toMatchObject({ transaction: { to: safe } })
})
