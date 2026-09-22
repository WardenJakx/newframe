import { beforeEach, describe, expect, it, mock } from 'bun:test'

import type { SafeTransactionPort } from '../../accounts/main/safeTransactionPort'
import { GasFeesSource } from '../../transactions/domain'
import type { AccessRequest, AccountRequest, AddChainRequest, TransactionRequest } from '../contract/requests'
import { RequestStatus, TxClassification } from '../contract/requests'
import { createRequestService, type RequestService } from './service'

const accountId = '0x1111111111111111111111111111111111111111'
const signerId = 'signer-1'
const otherAccountId = '0x2222222222222222222222222222222222222222'
const safeTxHash = `0x${'a'.repeat(64)}`

function transactionRequest(requestId: string): TransactionRequest {
  return {
    handlerId: requestId,
    type: 'transaction',
    origin: 'app.example',
    account: accountId,
    payload: {
      id: 7,
      jsonrpc: '2.0',
      method: 'eth_sendTransaction',
      _origin: 'app.example',
      params: [{ from: accountId, chainId: '0x1' }]
    },
    authorization: {
      actionId: `action-${requestId}`,
      decision: 'prompt',
      decidedAt: 1,
      principal: {
        kind: 'rpc',
        transport: 'http',
        connectionId: 'connection-1',
        origin: 'app.example'
      },
      intent: { requestType: 'transaction', account: accountId, method: 'eth_sendTransaction' }
    },
    data: {
      chainId: '0x1',
      from: accountId,
      gasLimit: '0x5208',
      gasPrice: `0x${2_000_000_000_000n.toString(16)}`,
      nonce: '0x0',
      type: '0x0',
      gasFeesSource: GasFeesSource.Dapp
    },
    approvals: [],
    feesUpdatedByUser: false,
    recipientType: '',
    recognizedActions: [],
    classification: TxClassification.NATIVE_TRANSFER
  }
}

function fixture() {
  const requests: Record<string, AccountRequest | undefined> = {}
  const state = {
    main: {
      currentAccount: accountId,
      accounts: {
        [accountId]: { id: accountId, address: accountId, requests },
        [otherAccountId]: { id: otherAccountId, address: otherAccountId, requests: {} }
      },
      assetRates: { ETH: { usdRate: 2_000, source: 'test', observedAt: 1 } },
      mute: { gasFeeWarning: false, signerCompatibilityWarning: false },
      networks: { ethereum: { 1: { id: 1, isTestnet: false } } },
      networksMeta: {
        ethereum: { 1: { nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 } } }
      },
      origins: {},
      signers: {
        [signerId]: {
          id: signerId,
          type: 'ledger',
          status: 'ok',
          addresses: [accountId],
          capabilities: []
        }
      }
    },
    tray: { homeCommand: null },
    navBack: mock(),
    navHome: mock(),
    switchOriginChain: mock(),
    activateNetwork: mock(),
    addNetwork: mock(),
    clearHomeCommand: mock()
  }
  const account = {
    id: accountId,
    address: accountId,
    signer: signerId,
    lastSignerType: 'ledger',
    requests,
    getRequest: <T extends AccountRequest>(requestId: string) => requests[requestId] as T | undefined,
    patchRequest(requestId: string, update: (request: AccountRequest) => void) {
      const request = requests[requestId]
      if (!request) {
        return
      }
      update(request)
      return request
    },
    rejectRequest(request: AccountRequest, error: EVMError) {
      service.reject(request, error)
      delete requests[request.handlerId]
    },
    resolveRequest(request: AccountRequest, result?: unknown) {
      service.resolve(request, result)
      delete requests[request.handlerId]
    },
    setAccess: mock((request: AccountRequest, approved: boolean, targetAddress = accountId) => {
      service.resolve(request, approved ? targetAddress : undefined)
      delete requests[request.handlerId]
    })
  }
  const approval = Promise.withResolvers<string>()
  const approveTransactionRequest = mock(() => approval.promise)
  const approveSafeTransaction = mock((..._args: Parameters<SafeTransactionPort['approve']>) => true)
  const executeSafeTransaction = mock(
    async (..._args: Parameters<SafeTransactionPort['execute']>) => `0x${'b'.repeat(64)}`
  )
  const removeUnsigned = mock(() => true)
  const trackSafeExecution = mock(() => true)
  const accounts = {
    clearRequestsByOrigin: mock(),
    current: () => account,
    get: (id: string) => (id === accountId ? state.main.accounts[accountId] : undefined),
    getFrameAccount: (id: string) => (id === accountId || id === otherAccountId ? account : undefined),
    rejectRequest(request: AccountRequest, error: EVMError) {
      service.reject(request, error)
      delete requests[request.handlerId]
    },
    replaceTx: mock(async () => undefined),
    resolveRequest(request: AccountRequest, result?: unknown) {
      service.resolve(request, result)
      delete requests[request.handlerId]
    },
    setAccess: mock(),
    setRequestError: mock((requestId: string, error: Error) => {
      Object.assign(requests[requestId] ?? {}, { status: 'error', notice: error.message })
    }),
    setRequestPending: mock((request: AccountRequest) => {
      Object.assign(requests[request.handlerId] ?? {}, { status: 'pending' })
    }),
    setRequestSuccess: mock((requestId: string) => {
      Object.assign(requests[requestId] ?? {}, { status: 'success' })
    }),
    setTxSent: mock((requestId: string, hash: string) => {
      Object.assign(requests[requestId] ?? {}, { status: 'verifying', tx: { hash, confirmations: 0 } })
    }),
    trackSafeExecution
  }
  const signerCompatibility = mock(() => ({ signer: 'ledger', tx: 'london', compatible: true }))
  const vault = { exists: mock(() => false), isUnlocked: mock(() => true) }
  const service: RequestService = createRequestService({
    accounts: accounts as never,
    agent: { resolveAccess: mock(() => true) },
    clock: { delay: async () => undefined },
    network: { rpcMatchesChain: mock(async () => true) },
    provider: {
      approveSign: mock(),
      approveSignTypedData: mock(),
      approveTransactionRequest
    },
    safeTransactions: {
      prepareDraft: mock() as never,
      attach: mock() as never,
      approve: approveSafeTransaction,
      removeUnsigned,
      cleanupUnsigned: mock(),
      prepareExecution: mock() as never,
      execute: executeSafeTransaction,
      status: mock() as never
    },
    store: { getState: () => state } as never,
    transactionPolicy: { signerCompatibility },
    vault
  })

  const add = (request: AccountRequest, respond: RPCRequestCallback) => {
    requests[request.handlerId] = request
    service.create(respond, request.handlerId)
    service.bind(request)
  }

  return {
    vault,
    account,
    accounts,
    add,
    approval,
    approveSafeTransaction,
    approveTransactionRequest,
    requests,
    executeSafeTransaction,
    removeUnsigned,
    service,
    signerCompatibility,
    state,
    trackSafeExecution
  }
}

describe('prompted request lifecycle', () => {
  let test: ReturnType<typeof fixture>

  beforeEach(() => {
    test = fixture()
  })

  it.each(['locked', 'pending', 'settled', 'app-locked', 'non-prompt', 'signature'] as const)(
    'rejects new adjustments on a %s request without changing its data',
    (condition) => {
      const request = transactionRequest('ineligible')
      test.add(request, mock())
      if (condition === 'locked') {
        request.locked = true
      }
      if (condition === 'pending') {
        request.status = 'pending' as never
      }
      if (condition === 'settled') {
        test.service.resolve(request, '0xhash')
      }
      if (condition === 'app-locked') {
        test.vault.exists.mockReturnValue(true)
        test.vault.isUnlocked.mockReturnValue(false)
      }
      if (condition === 'non-prompt') {
        request.authorization!.decision = 'allow' as never
      }
      if (condition === 'signature') {
        ;(request as AccountRequest).type = 'sign'
      }
      const original = structuredClone(request)
      expect(test.service.approve(request.handlerId, undefined, { nonce: '0x2' })).toBeFalse()
      expect(request).toEqual(original)
      expect(test.approveTransactionRequest).not.toHaveBeenCalled()
    }
  )

  it('keeps selected Safe owner approvals pending and allocates a fresh operation for retries', () => {
    const request = transactionRequest('safe-owner')
    request.safeTxHash = safeTxHash
    delete request.data.nonce
    delete request.data.gasLimit
    test.add(request, mock())
    const context = { owner: { clientType: 'wallet-ui', windowInstanceId: 'window' } } as never

    expect(test.service.approve(request.handlerId, context, undefined, otherAccountId)).toBeTrue()
    expect(test.approveSafeTransaction).toHaveBeenCalledTimes(1)
    const [command, approvalContext] = test.approveSafeTransaction.mock.calls[0]
    expect(command).toMatchObject({
      type: 'request.approve',
      accountId,
      chainId: 1,
      safeTxHash,
      ownerId: otherAccountId
    })
    expect(command.operationId).toMatch(new RegExp(`^${request.handlerId}:${otherAccountId}:[0-9a-f-]{36}$`))
    expect(approvalContext).toBe(context)
    expect(test.approveTransactionRequest).not.toHaveBeenCalled()
    expect(test.accounts.setTxSent).not.toHaveBeenCalled()
    expect(request.status).toBe(RequestStatus.Pending)

    expect(test.service.approve(request.handlerId, context, undefined, otherAccountId)).toBeTrue()
    expect(test.approveSafeTransaction).toHaveBeenCalledTimes(2)
    expect(test.approveSafeTransaction.mock.calls[1][0].operationId).not.toBe(command.operationId)
  })

  it('executes a reviewed Safe outer transaction and settles its live RPC once from the submitted sink', async () => {
    const request = transactionRequest('safe-executor')
    request.safeTxHash = safeTxHash
    delete request.data.nonce
    delete request.data.gasLimit
    const respond = mock()
    test.add(request, respond)
    const context = { owner: { clientType: 'wallet-ui', windowInstanceId: 'window' } } as never
    const adjustments = { gasLimit: '0x1234' }

    expect(
      test.service.approve(request.handlerId, context, adjustments, undefined, otherAccountId)
    ).toBeTrue()
    await Promise.resolve()
    expect(test.executeSafeTransaction).toHaveBeenCalledTimes(1)
    const execution = test.executeSafeTransaction.mock.calls[0]
    expect(execution.slice(0, 4)).toEqual([
      { accountId, chainId: 1, safeTxHash },
      otherAccountId,
      adjustments,
      context
    ])
    expect(execution[4]).toMatch(new RegExp(`^${request.handlerId}:${otherAccountId}:execute:[0-9a-f-]{36}$`))

    const outerTxHash = `0x${'c'.repeat(64)}`
    expect(test.service.notifySafeTransactionSubmitted({ safeTxHash, outerTxHash })).toBeTrue()
    expect(test.service.notifySafeTransactionSubmitted({ safeTxHash, outerTxHash })).toBeTrue()
    expect(respond).toHaveBeenCalledTimes(1)
    expect(respond).toHaveBeenCalledWith({ id: 7, jsonrpc: '2.0', result: outerTxHash })
    expect(test.accounts.setTxSent).toHaveBeenCalledTimes(1)
    expect(test.accounts.setTxSent).toHaveBeenCalledWith(request.handlerId, outerTxHash)
    expect(test.trackSafeExecution).not.toHaveBeenCalled()
  })

  it('retries a failed Safe execution with a fresh operation and settles after submission', async () => {
    const request = transactionRequest('safe-execution-retry')
    request.safeTxHash = safeTxHash
    delete request.data.nonce
    delete request.data.gasLimit
    const respond = mock()
    test.add(request, respond)
    const context = { owner: { clientType: 'wallet-ui', windowInstanceId: 'window' } } as never
    test.executeSafeTransaction
      .mockRejectedValueOnce(new Error('broadcast failed'))
      .mockResolvedValueOnce(`0x${'b'.repeat(64)}`)

    expect(test.service.approve(request.handlerId, context, undefined, undefined, otherAccountId)).toBeTrue()
    await Promise.resolve()
    await Promise.resolve()
    expect(test.service.approve(request.handlerId, context, undefined, undefined, otherAccountId)).toBeTrue()
    await Promise.resolve()

    expect(test.executeSafeTransaction).toHaveBeenCalledTimes(2)
    const first = test.executeSafeTransaction.mock.calls[0][4]
    const second = test.executeSafeTransaction.mock.calls[1][4]
    expect(second).not.toBe(first)
    expect(respond).not.toHaveBeenCalled()

    const outerTxHash = `0x${'c'.repeat(64)}`
    expect(test.service.notifySafeTransactionSubmitted({ safeTxHash, outerTxHash })).toBeTrue()
    expect(respond).toHaveBeenCalledWith({ id: 7, jsonrpc: '2.0', result: outerTxHash })
  })

  it('records queue-initiated Safe execution without requiring an RPC continuation', () => {
    const outerTxHash = `0x${'d'.repeat(64)}`
    expect(test.service.notifySafeTransactionSubmitted({ safeTxHash, outerTxHash })).toBeTrue()
    expect(test.trackSafeExecution).toHaveBeenCalledTimes(1)
    expect(test.trackSafeExecution).toHaveBeenCalledWith(safeTxHash, outerTxHash)
  })

  it('asks the Safe coordinator to remove only unsigned rejected drafts', () => {
    const request = transactionRequest('safe-reject')
    request.safeTxHash = safeTxHash
    test.add(request, mock())

    expect(test.service.rejectRequest(request.handlerId)).toBeTrue()
    expect(test.removeUnsigned).toHaveBeenCalledWith({
      type: 'safe.confirmation-status',
      accountId,
      chainId: 1,
      safeTxHash,
      ownerId: accountId
    })
  })

  it('freezes accepted equal fees while a warning is pending and signs the stored candidate', () => {
    const request = transactionRequest('adjusted')
    request.automaticFeeUpdateNotice = { previousFee: '0x1' }
    test.add(request, mock())
    expect(test.service.approve(request.handlerId)).toBeTrue()
    const gate = request.approvalGate
    expect(gate?.type).toBe('gas-fee')
    expect(test.service.approve(request.handlerId, undefined, { gasPrice: request.data.gasPrice })).toBeTrue()
    expect(request.feesUpdatedByUser).toBeTrue()
    expect(request.automaticFeeUpdateNotice).toBeUndefined()
    expect(request.approvalGate).toEqual(gate)
    expect(test.service.confirmWarning(request.handlerId, 'gas-fee')).toBeTrue()
    expect(test.approveTransactionRequest).toHaveBeenCalledWith(request, undefined)
    expect(test.service.approve(request.handlerId, undefined, { nonce: '0x2' })).toBeFalse()
    expect(request.data.nonce).toBe('0x0')
  })

  it('recomputes a warning after candidate changes and rejects invalid candidates without partial writes', () => {
    const request = transactionRequest('adjusted')
    test.add(request, mock())
    test.service.approve(request.handlerId)
    const original = structuredClone(request)
    expect(() =>
      test.service.approve(request.handlerId, undefined, { nonce: '0x2', gasPrice: '0xffffffffffffffff' })
    ).toThrow()
    expect(request).toEqual(original)
    expect(test.approveTransactionRequest).not.toHaveBeenCalled()
    expect(
      test.service.approve(request.handlerId, undefined, { gasPrice: '0x3b9aca00', nonce: '0x2' })
    ).toBeTrue()
    expect(request.approvalGate).toBeUndefined()
    expect(request.data.nonce).toBe('0x2')
    expect(test.approveTransactionRequest).toHaveBeenCalledTimes(1)
  })

  it.each([1, 8453])('returns null after approving chain %i', async (chainId) => {
    const request: AddChainRequest = {
      handlerId: 'add-chain',
      type: 'addChain',
      origin: 'app.example',
      account: accountId,
      chain: {
        id: chainId,
        type: 'ethereum',
        name: 'Test chain',
        symbol: 'ETH',
        primaryRpc: 'https://rpc.example'
      },
      payload: {
        id: 8,
        jsonrpc: '2.0',
        method: 'wallet_addEthereumChain',
        params: [{ chainId: `0x${chainId.toString(16)}` }]
      }
    }
    const responses: RPCResponsePayload[] = []
    test.add(request, (response) => responses.push(response))

    test.service.reviewAddChain(request.handlerId)
    expect(responses).toEqual([])

    await test.service.resolveNetwork({
      type: 'network.request-resolve',
      requestId: request.handlerId,
      approved: true
    })

    expect(responses).toEqual([{ id: 8, jsonrpc: '2.0', result: null }])
    expect(test.service.pendingCount).toBe(0)
  })

  it('owns one continuation keyed by request ID and settles it exactly once', () => {
    const request = transactionRequest('request-once')
    const responses: RPCResponsePayload[] = []
    test.add(request, (response) => responses.push(response))

    expect(test.service.resolve(request, 'first')).toBe(true)
    expect(test.service.resolve(request, 'late')).toBe(false)
    expect(responses).toEqual([{ id: 7, jsonrpc: '2.0', result: 'first' }])
    expect(test.service.pendingCount).toBe(0)
  })

  it('can release an internal continuation without invoking its response', () => {
    const respond = mock()
    test.service.create(respond, 'internal-request')

    expect(test.service.cancel('internal-request')).toBe(true)
    expect(test.service.cancel('internal-request')).toBe(false)
    expect(respond).not.toHaveBeenCalled()
    expect(test.service.pendingCount).toBe(0)
  })

  it('clears a cancelled signing source without responding or accepting its late result', async () => {
    const request = transactionRequest('cancel-signing')
    const respond = mock()
    test.state.main.mute.gasFeeWarning = true
    test.add(request, respond)
    test.service.approve(request.handlerId)
    expect(test.service.cancel(request.handlerId)).toBe(true)
    expect(test.requests[request.handlerId]).toBeUndefined()
    test.approval.resolve('0xlate')
    await Promise.resolve()
    expect(respond).not.toHaveBeenCalled()
    expect(test.accounts.setTxSent).not.toHaveBeenCalled()
  })

  it('does not clear a replacement request when its previous approval is cancelled', async () => {
    const request = transactionRequest('replaced-approval')
    const respond = mock()
    test.state.main.mute.gasFeeWarning = true
    test.add(request, respond)
    test.service.approve(request.handlerId)
    const replacement = {
      ...request,
      authorization: { ...request.authorization!, actionId: 'replacement-action' }
    }
    test.requests[request.handlerId] = replacement
    test.approval.reject(Object.assign(new Error('cancelled'), { code: 4001 }))
    await Promise.resolve()
    expect(test.requests[request.handlerId]).toBe(replacement)
    expect(test.accounts.setRequestError).not.toHaveBeenCalled()
    expect(respond).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.objectContaining({ code: 4001 }) as unknown })
    )
  })

  it('deduplicates repeated approval while preserving the external success response', async () => {
    const request = transactionRequest('request-approval')
    test.state.main.mute.gasFeeWarning = true
    const responses: RPCResponsePayload[] = []
    test.add(request, (response) => responses.push(response))

    expect(test.service.approve(request.handlerId)).toBe(true)
    expect(test.service.approve(request.handlerId)).toBe(true)
    expect(test.approveTransactionRequest.mock.calls.length).toBe(1)

    test.approval.resolve('0xhash')
    await test.approval.promise
    await Promise.resolve()
    expect(test.service.approve(request.handlerId)).toBe(true)
    expect(test.approveTransactionRequest.mock.calls.length).toBe(1)
    expect(responses).toEqual([{ id: 7, jsonrpc: '2.0', result: '0xhash' }])
    expect(test.accounts.setTxSent).toHaveBeenCalledTimes(1)
    expect(test.requests[request.handlerId]).toMatchObject({
      status: 'verifying',
      tx: { hash: '0xhash', confirmations: 0 }
    })
  })

  it('projects compatibility before gas and advances only the exact pending warning gate', () => {
    const request = transactionRequest('request-gates')
    test.signerCompatibility.mockReturnValue({ signer: 'ledger', tx: 'london', compatible: false })
    test.add(request, mock())

    expect(test.service.approve(request.handlerId)).toBe(true)
    expect(test.requests[request.handlerId]!.approvalGate).toMatchObject({
      type: 'signer-compatibility',
      reason: 'incompatible'
    })
    expect(test.service.confirmWarning(request.handlerId, 'gas-fee')).toBe(false)
    expect(test.service.confirmWarning(request.handlerId, 'signer-compatibility')).toBe(true)
    expect(test.requests[request.handlerId]!.approvalGate).toEqual({
      type: 'gas-fee',
      feeUSD: '84.00',
      currentSymbol: 'ETH'
    })
    expect(test.service.confirmWarning(request.handlerId, 'signer-compatibility')).toBe(false)
    expect(test.service.confirmWarning(request.handlerId, 'gas-fee')).toBe(true)
    expect(test.approveTransactionRequest.mock.calls.length).toBe(1)
  })

  it('rejects and removes every bound continuation during shutdown', () => {
    const first = transactionRequest('request-shutdown-1')
    const second = transactionRequest('request-shutdown-2')
    const responses: RPCResponsePayload[] = []
    test.add(first, (response) => responses.push(response))
    test.add(second, (response) => responses.push(response))

    test.service.dispose()

    expect(responses).toEqual([
      {
        id: 7,
        jsonrpc: '2.0',
        error: { code: 4001, message: 'Request cancelled because Newframe is shutting down' }
      },
      {
        id: 7,
        jsonrpc: '2.0',
        error: { code: 4001, message: 'Request cancelled because Newframe is shutting down' }
      }
    ])
    expect(test.requests).toEqual({})
    expect(test.service.pendingCount).toBe(0)
  })
})

it.each([
  { method: 'eth_requestAccounts', approved: true, selected: otherAccountId, target: otherAccountId },
  { method: 'personal_sign', approved: true, selected: otherAccountId, target: accountId },
  { method: 'eth_requestAccounts', approved: false, selected: otherAccountId, target: undefined },
  { method: 'eth_requestAccounts', approved: true, selected: 'missing', target: undefined }
])(
  'resolves $method from its original owner with selected=$selected approved=$approved',
  ({ method, approved, selected, target }) => {
    const test = fixture()
    const request: AccessRequest = {
      type: 'access',
      handlerId: 'connect',
      origin: 'app.example',
      account: accountId,
      payload: { id: 17, jsonrpc: '2.0', method, params: [] }
    }
    const respond = mock<RPCRequestCallback>()
    test.add(request, respond)
    test.state.main.currentAccount = selected
    expect(test.service.resolveAccess(request.handlerId, approved)).toBe(true)
    expect(respond).toHaveBeenCalledWith({ id: 17, jsonrpc: '2.0', result: target })
    expect(test.requests[request.handlerId]).toBeUndefined()
    if (target === otherAccountId) {
      expect(test.account.setAccess).toHaveBeenCalledWith(request, true, otherAccountId)
    }
    if (!target) {
      expect(test.account.setAccess).toHaveBeenCalledWith(request, false)
    }
  }
)
