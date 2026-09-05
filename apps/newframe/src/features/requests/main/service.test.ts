import { beforeEach, describe, expect, it, mock } from 'bun:test'

import type { AccountRequest, AddChainRequest, TransactionRequest } from '../contract/requests'
import { TxClassification } from '../contract/requests'
import { GasFeesSource } from '../../transactions/domain'
import { createRequestService, type RequestService } from './service'

const accountId = '0x1111111111111111111111111111111111111111'
const signerId = 'signer-1'

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
  const requests: Record<string, AccountRequest> = {}
  const state = {
    main: {
      accounts: {
        [accountId]: { id: accountId, address: accountId, requests }
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
    getRequest: <T extends AccountRequest>(requestId: string) => requests[requestId] as T,
    patchRequest(requestId: string, update: (request: AccountRequest) => void) {
      const request = requests[requestId]
      if (!request) return
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
    setAccess(request: AccountRequest, approved: boolean) {
      service.resolve(request, approved)
      delete requests[request.handlerId]
    }
  }
  const approval = Promise.withResolvers<string>()
  const approveTransactionRequest = mock(() => approval.promise)
  const accounts = {
    clearRequestsByOrigin: mock(),
    current: () => account,
    get: (id: string) => (id === accountId ? state.main.accounts[accountId] : undefined),
    getFrameAccount: (id: string) => (id === accountId ? account : undefined),
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
      Object.assign(requests[requestId] || {}, { status: 'error', notice: error.message })
    }),
    setRequestPending: mock((request: AccountRequest) => {
      Object.assign(requests[request.handlerId] || {}, { status: 'pending' })
    }),
    setRequestSuccess: mock((requestId: string) => {
      Object.assign(requests[requestId] || {}, { status: 'success' })
    }),
    setTxSent: mock((requestId: string, hash: string) => {
      Object.assign(requests[requestId] || {}, { status: 'verifying', tx: { hash, confirmations: 0 } })
    })
  }
  const signerCompatibility = mock(() => ({ signer: 'ledger', tx: 'london', compatible: true }))
  const service: RequestService = createRequestService({
    accounts: accounts as never,
    agent: { resolveAccess: mock(() => true) },
    clock: { delay: async () => undefined },
    network: { rpcMatchesChain: mock(async () => true) },
    provider: {
      approveSign: mock(),
      approveSignTypedData: mock(),
      approveTransactionRequest
    } as never,
    store: { getState: () => state } as never,
    transactionPolicy: { signerCompatibility } as never,
    vault: { exists: () => false, isUnlocked: () => true }
  })

  const add = (request: AccountRequest, respond: RPCRequestCallback) => {
    requests[request.handlerId] = request
    service.create(respond, request.handlerId)
    service.bind(request)
  }

  return {
    account,
    accounts,
    add,
    approval,
    approveTransactionRequest,
    requests,
    service,
    signerCompatibility,
    state
  }
}

describe('prompted request lifecycle', () => {
  let test: ReturnType<typeof fixture>

  beforeEach(() => {
    test = fixture()
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

    if (chainId === 1) {
      expect(test.state.activateNetwork).toHaveBeenCalledWith('ethereum', chainId, true)
    } else {
      expect(test.state.addNetwork).toHaveBeenCalledWith(request.chain)
    }
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
    expect(test.requests[request.handlerId].approvalGate).toMatchObject({
      type: 'signer-compatibility',
      reason: 'incompatible'
    })
    expect(test.service.confirmWarning(request.handlerId, 'gas-fee')).toBe(false)
    expect(test.service.confirmWarning(request.handlerId, 'signer-compatibility')).toBe(true)
    expect(test.requests[request.handlerId].approvalGate).toEqual({
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
