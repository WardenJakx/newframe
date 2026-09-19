import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest as timers,
  mock,
  spyOn
} from 'bun:test'

import { intToHex } from '@ethereumjs/util'
import log from 'electron-log'

import { gweiToHex } from '../../../../test/support/util'
import {
  ActivityRecordSchema,
  DEFAULT_PROFILE_ID,
  type ActivityRecord
} from '../../../app/contracts/state/main'
import store from '../../../platform/state-store'
import {
  createAgentPrincipal,
  createRpcPrincipal,
  type TrustedPrincipal
} from '../../access-control/main/authority'
import {
  RequestMode,
  RequestStatus,
  TxClassification,
  type AccountRequest,
  type CanonicalAccountRequest,
  type TransactionRequest
} from '../../requests/contract/requests'
import {
  GasFeesSource,
  TRANSACTION_CONFIRMATION_TARGET,
  type TransactionEffect,
  type TransactionSimulation
} from '../../transactions/domain'

const providerMock = {
  send: mock((_payload: RPCRequestPayload, _callback: RPCRequestCallback) => {}),
  sendAsync: mock((_payload: RPCRequestPayload, _callback: Callback<RPCResponsePayload>) => {}),
  getL1GasCost: mock(),
  emit: mock(),
  on: mock(),
  off: mock()
}
const signersMock = { get: mock() }
const windowsMock = { broadcast: mock(), showTray: mock() }
const navMock = { on: mock(), forward: mock(), back: mock() }
const persistenceMock = { flush: mock() }
const notificationMock = mock()
const openBlockExplorerMock = mock()
const externalDataScannerMock = {
  refreshBalances: mock(),
  refreshPositions: mock(),
  close: mock()
}
const externalDataScannerFactoryMock = mock(() => externalDataScannerMock)
const transactionMock = {
  maxFee: mock(() => 1e30),
  signerCompatibility: mock()
}
const requestLifecycle = {
  pending: new Map<string, RPCRequestCallback>(),
  bind: mock(),
  create(respond: RPCRequestCallback, requestId: string = crypto.randomUUID()) {
    this.pending.set(requestId, respond)
    return requestId
  },
  respond(requestId: string, response: RPCResponsePayload) {
    const callback = this.pending.get(requestId)
    if (!callback) {
      return false
    }
    this.pending.delete(requestId)
    callback(response)
    return true
  },
  resolve(request: AccountRequest, result?: unknown) {
    return this.respond(request.handlerId, {
      id: request.payload.id,
      jsonrpc: request.payload.jsonrpc,
      result
    })
  },
  reject(request: AccountRequest, error: EVMError) {
    return this.respond(request.handlerId, {
      id: request.payload.id,
      jsonrpc: request.payload.jsonrpc,
      error
    })
  }
}

await mock.module('../../../platform/signing/signers', () => ({ default: signersMock, ...signersMock }))
await mock.module('../../../platform/desktop/windows', () => ({ default: windowsMock, ...windowsMock }))
await mock.module('../../asset-data/main/externalData', () => ({
  default: externalDataScannerFactoryMock,
  start: mock(),
  stop: mock()
}))
await mock.module('../../name-resolution/main/nameResolution', () => ({
  __esModule: true,
  default: {
    ready: () => true,
    once: mock(),
    reverseLookup: mock()
  }
}))

const provider = providerMock
let Accounts: import('./index').Accounts
let AccountsClass: typeof import('./index').Accounts

const nameResolutionMock = {
  started: true,
  start: mock(),
  dispose: mock(),
  ready: () => true,
  once: mock(),
  off: mock(),
  resolveAddress: mock(async () => ''),
  reverseLookup: mock()
}
const revealMock = {
  identity: mock(async () => ({ type: '', ens: '' })),
  resolveEntityType: mock(async () => 'unknown' as const),
  decode: mock(),
  recog: mock(async () => []),
  simulate: mock(async () => {})
}
const simulationMock = {
  simulateTransactionEffects: mock(async (): Promise<TransactionSimulation> => ({
    status: 'success',
    effects: []
  }))
}

function createAccounts(chainRpc = providerMock) {
  return new AccountsClass(store, {
    chainRpc,
    transactionPolicy: transactionMock,
    simulation: simulationMock,
    nameResolution: nameResolutionMock,
    reveal: revealMock,
    createDataScanner: externalDataScannerFactoryMock,
    requests: requestLifecycle,
    runtime: {
      navigation: navMock,
      now: Date.now,
      notify: notificationMock,
      openBlockExplorer: openBlockExplorerMock,
      persistence: persistenceMock,
      schedule: (callback: () => void, delay: number) => setTimeout(callback, delay),
      signers: signersMock,
      windows: windowsMock
    }
  })
}

const storeState = () => store.getState()
const rpcResult = (result: unknown): RPCResponsePayload => ({ id: 1, jsonrpc: '2.0', result })
const rpcError = (code: number, message: string): RPCResponsePayload => ({
  id: 1,
  jsonrpc: '2.0',
  error: { code, message }
})
const currentAccount = () => {
  const current = Accounts.current()
  if (!current) {
    throw new Error('Expected a current account')
  }
  return current
}
const requiredFrameAccount = (accounts: import('./index').Accounts, address: string) => {
  const frameAccount = accounts.getFrameAccount(address)
  if (!frameAccount) {
    throw new Error(`Expected frame account ${address}`)
  }
  return frameAccount
}
const canonicalRequest = (id: string | number = request.handlerId) =>
  currentAccount().getRequest<TransactionRequest>(String(id))
const requiredCanonicalRequest = (id: string | number = request.handlerId) => {
  const current = currentAccount().getRequest<TransactionRequest>(String(id))
  if (!current) {
    throw new Error(`Expected canonical request ${id}`)
  }
  return current
}
const patchRequest = (
  update: (request: TransactionRequest) => void,
  id: string | number = request.handlerId
) => currentAccount().patchRequest(String(id), update)
const flushPromises = async (count = 4) => {
  while (count-- > 0) {
    await Promise.resolve()
  }
}
function mockConfirmedReceipt(receiptBlock: number) {
  provider.send = mock((payload: RPCRequestPayload, cb: RPCRequestCallback) => {
    if (payload.method === 'eth_subscribe') {
      return cb(rpcError(-32601, 'unsupported'))
    }
    if (payload.method === 'eth_blockNumber') {
      return cb(rpcResult(intToHex(receiptBlock + TRANSACTION_CONFIRMATION_TARGET)))
    }
    if (payload.method === 'eth_getTransactionReceipt') {
      return cb(rpcResult({ status: '0x1', blockNumber: intToHex(receiptBlock), gasUsed: '0x5208' }))
    }
    cb(rpcResult(null))
  })
}
function setSubmittedActivity(hash: string, overrides: Record<string, unknown> = {}) {
  store.setState((state) => {
    state.main.activity = {
      [hash]: {
        id: hash,
        hash,
        account: account.address,
        address: account.address,
        chainId: 1,
        nonce: request.data.nonce,
        status: 'submitted',
        confirmations: 0,
        data: { ...request.data, from: account.address },
        ...overrides
      }
    }
  })
}

const accountAddress = '0x22dd63c3619818fdbc262c78baee43cb61e9cccf'
const account = { id: accountAddress, address: accountAddress }
const account2 = { address: '0xef8f1bbe054ad30c6af774ed7a7c70a74ef77ac5' }

const createRequest = (): TransactionRequest => ({
  handlerId: '1',
  origin: '0r161n',
  type: 'transaction' as const,
  account: accountAddress,
  data: {
    from: accountAddress,
    chainId: '0x1',
    gasLimit: intToHex(21000),
    gasPrice: gweiToHex(30),
    type: '0x2',
    maxPriorityFeePerGas: gweiToHex(1),
    maxFeePerGas: gweiToHex(9),
    nonce: '0xa',
    gasFeesSource: GasFeesSource.Frame
  },
  payload: {
    jsonrpc: '2.0' as const,
    id: 7,
    method: 'eth_sendTransaction',
    params: [{ from: accountAddress, nonce: '0xa', chainId: '0x1' }],
    _origin: 'accounts-test'
  },
  approvals: [],
  feesUpdatedByUser: false,
  recipientType: '',
  recognizedActions: [],
  classification: TxClassification.CONTRACT_CALL
})

let request = createRequest()

beforeAll(async () => {
  log.transports.console.level = false

  const accountsModule = await import('./index')
  AccountsClass = accountsModule.Accounts
  Accounts = createAccounts()
})

afterAll(() => {
  Accounts.dispose()
  log.transports.console.level = 'debug'
})

beforeEach((done) => {
  timers.useFakeTimers()
  requestLifecycle.pending.clear()
  request = createRequest()

  void Accounts.add(account2.address, 'Test Account 2')
  void Accounts.add(account.address, 'Test Account 1', account, (_error, addedAccount) => {
    if (!addedAccount) {
      return done(new Error('Expected account to be added'))
    }
    Accounts.setSigner(addedAccount.address, done)
  })
})

afterEach(() => {
  Object.values(Accounts.accounts).forEach((account) => {
    if (!account) {
      return
    }
    Object.keys(account.requests).forEach((id) => {
      Accounts.removeRequest(account, id)
    })
  })
  timers.useRealTimers()
})

describe('#routeRequest', () => {
  it('attaches a prompt decision from the trusted transport before queueing', () => {
    const principal = createRpcPrincipal({
      transport: 'http',
      connectionId: 'accounts-test',
      origin: 'app.example'
    })
    const routedRequest = { ...request, account: account.address }

    expect(Accounts.routeRequest(principal, routedRequest)).toBe(true)
    expect(canonicalRequest()).toMatchObject({
      authorization: {
        decision: 'prompt',
        principal: {
          kind: 'rpc',
          transport: 'http',
          connectionId: 'accounts-test',
          origin: 'app.example'
        }
      }
    })
    expect(typeof requiredCanonicalRequest().authorization?.actionId).toBe('string')
    expect(typeof requiredCanonicalRequest().authorization?.decidedAt).toBe('number')
  })

  it('rejects an unminted principal without queueing the request', () => {
    const respond = mock()
    requestLifecycle.create(respond, request.handlerId)
    const forgedPrincipal = {
      kind: 'renderer',
      role: 'wallet-ui',
      entrypoint: 'tray',
      webContentsId: 1,
      windowInstanceId: 'forged'
    }

    expect(
      Accounts.routeRequest(forgedPrincipal as unknown as TrustedPrincipal, {
        ...request,
        account: account.address
      })
    ).toBe(false)
    expect(canonicalRequest()).toBeUndefined()
    expect(respond).toHaveBeenCalledWith({
      id: request.payload.id,
      jsonrpc: request.payload.jsonrpc,
      error: { code: 4100, message: 'Untrusted request source' }
    })
  })

  it('executes an authorized agent action without adding it to the prompt queue', () => {
    const execute = mock()
    const principal = createAgentPrincipal({
      sessionId: 'agent-session',
      accountId: account.address,
      expiresAt: Date.now() + 60_000,
      isActive: () => true
    })
    const routedRequest = { ...request, account: account.address }
    requestLifecycle.create(mock(), request.handlerId)

    expect(Accounts.routeRequest(principal, routedRequest, execute)).toBe(true)
    expect(execute).toHaveBeenCalled()
    expect(execute.mock.calls[0]?.[0]).toMatchObject({ authorization: { decision: 'autonomous' } })
    expect(canonicalRequest()).toBeUndefined()
  })

  it('fails closed when an autonomous action has no executor', () => {
    const respond = mock()
    requestLifecycle.create(respond, request.handlerId)
    const principal = createAgentPrincipal({
      sessionId: 'agent-session',
      accountId: account.address,
      expiresAt: Date.now() + 60_000,
      isActive: () => true
    })

    expect(Accounts.routeRequest(principal, { ...request, account: account.address })).toBe(false)
    expect(respond).toHaveBeenCalledWith({
      id: request.payload.id,
      jsonrpc: request.payload.jsonrpc,
      error: { code: 4100, message: 'Autonomous signing is not enabled for this action' }
    })
    expect(canonicalRequest()).toBeUndefined()
  })
})

it('selects the first remaining account when removing the current account', () => {
  store.setState((state) => {
    state.main.accountOrder = [account2.address, account.address]
  })

  Accounts.remove(account.address)

  expect(currentAccount().address).toBe(account2.address)
  expect(storeState().main.currentAccount).toBe(account2.address)
  expect(storeState().main.accounts[account.address]).toBeUndefined()
})

it('rejects pending requests before removing their account', () => {
  const respond = mock()
  const pendingRequest = {
    handlerId: 'pending-signature',
    type: 'sign',
    origin: '0r161n',
    account: account.address,
    payload: { id: 42, jsonrpc: '2.0', method: 'eth_sign', params: [account.address, '0x01'] }
  }

  const removedAccount = currentAccount()
  requestLifecycle.create(respond, pendingRequest.handlerId)
  removedAccount.addRequest(pendingRequest)
  Accounts.remove(account.address)
  Accounts.remove(account.address)

  expect(respond.mock.calls).toEqual([
    [
      {
        id: 42,
        jsonrpc: '2.0',
        error: { code: 4001, message: 'User rejected the request' }
      }
    ]
  ])
  expect(requestLifecycle.pending.has(pendingRequest.handlerId)).toBe(false)
  expect(storeState().main.accounts[account.address]).toBeUndefined()
})

it('retains and can settle a pending request after its account moves and the old profile is removed', () => {
  const profileId = 'request-profile'
  const respond = mock()
  const pendingRequest = {
    ...request,
    handlerId: 'profile-request',
    account: account.address
  }

  storeState().createProfile(profileId, 'Request Profile')
  storeState().moveAccountToProfile(account.address, profileId)
  storeState().selectProfile(profileId)
  requestLifecycle.create(respond, pendingRequest.handlerId)
  const frameAccount = requiredFrameAccount(Accounts, account.address)
  frameAccount.addRequest(pendingRequest)
  storeState().moveAccountToProfile(account.address, DEFAULT_PROFILE_ID)
  storeState().deleteProfile(profileId)

  expect(storeState().main.profiles[profileId]).toBeUndefined()
  expect(frameAccount.requests[pendingRequest.handlerId]).toBeTruthy()
  frameAccount.resolveRequest(pendingRequest, 'profile result')
  expect(respond.mock.calls).toEqual([[{ id: 7, jsonrpc: '2.0', result: 'profile result' }]])
})

it('uses canonical request state for transaction failure without activity', () => {
  const frameAccount = requiredFrameAccount(Accounts, account.address)
  const transaction = { ...request, handlerId: 'failed-transaction', account: account.address }
  frameAccount.addRequest(transaction, mock())
  Accounts.setRequestPending(transaction)
  Accounts.setTxSigned(transaction.handlerId, (error: Error | null) => expect(error).toBe(null))
  expect(frameAccount.requests[transaction.handlerId]).toMatchObject({
    status: 'sending',
    notice: 'Sending'
  })
  Accounts.setRequestError(transaction.handlerId, new Error('broadcast failed'))
  expect(frameAccount.requests[transaction.handlerId]).toMatchObject({
    status: 'error',
    notice: 'broadcast failed',
    mode: 'normal'
  })
  expect(storeState().main.activity).toEqual({})
  expect(notificationMock.mock.calls.length).toBe(0)
  timers.advanceTimersByTime(1_500)
  expect(frameAccount.requests[transaction.handlerId]?.mode).toBe(RequestMode.Monitor)
  timers.advanceTimersByTime(8_000)
  expect(frameAccount.requests[transaction.handlerId]).toBeUndefined()
})

it('clears the selected account when removing the last account', () => {
  Accounts.remove(account2.address)
  Accounts.remove(account.address)

  expect(Accounts.current()).toBeNull()
  expect(storeState().main.currentAccount).toBe('')
})

describe('#initialize', () => {
  it('does not instantiate persisted accounts or start services during construction', () => {
    const accounts = createAccounts()

    expect(accounts.accounts).toEqual({})
    expect(externalDataScannerFactoryMock).not.toHaveBeenCalled()
  })

  it('instantiates persisted accounts only during explicit post-hydration initialization', () => {
    const persistedAccounts = storeState().main.accounts
    store.setState((state) => {
      state.main.accounts = {}
    })
    const accounts = createAccounts()

    expect(accounts.accounts[account.address]).toBeUndefined()

    store.setState((state) => {
      state.main.accounts = persistedAccounts
    })
    accounts.initialize()

    expect(accounts.accounts[account.address]?.address).toBe(account.address)

    accounts.close()
  })

  it('owns an idempotent, restartable lifecycle for persisted account handles', () => {
    const accounts = createAccounts(providerMock)

    accounts.start()
    const initializedAccount = accounts.accounts[account.address]
    accounts.start()

    expect(accounts.accounts[account.address]).toBe(initializedAccount)

    accounts.dispose()
    expect(accounts.accounts).toEqual({})

    accounts.start()
    expect(accounts.accounts[account.address]?.address).toBe(account.address)
    expect(accounts.accounts[account.address]).not.toBe(initializedAccount)

    accounts.dispose()
  })
})

describe('#startDataScanner', () => {
  it('owns a lazy, idempotent scanner lifecycle with safe pre-start operations', () => {
    const accounts = createAccounts()

    accounts.refreshBalances(account.address)
    expect(externalDataScannerFactoryMock).not.toHaveBeenCalled()
    expect(externalDataScannerMock.refreshBalances).not.toHaveBeenCalled()
    expect(() => accounts.close()).not.toThrow()
    expect(externalDataScannerMock.close).not.toHaveBeenCalled()

    const startedAccounts = createAccounts()
    startedAccounts.startDataScanner()
    startedAccounts.startDataScanner()
    expect(externalDataScannerFactoryMock).toHaveBeenCalledTimes(1)
    startedAccounts.close()
  })

  it('tracks and refreshes affected positions from an external order lifecycle', () => {
    const accounts = createAccounts()
    const token = {
      address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
      chainId: 31337,
      decimals: 6,
      name: 'USD Coin',
      symbol: 'USDC'
    }

    accounts.startDataScanner()

    expect(accounts.refreshPositions(account.address, 31337, [token])).toBe(true)
    const tokenId = `${token.chainId}:${token.address}`
    expect(storeState().main.tokens.byId[tokenId]).toEqual(
      expect.objectContaining(token) as unknown as NonNullable<
        ReturnType<typeof storeState>['main']['tokens']['byId'][string]
      >
    )
    expect(storeState().main.tokens.accountTokenIds[account.address]).toContain(tokenId)
    expect(externalDataScannerMock.refreshPositions).toHaveBeenCalledWith(account.address, 31337, [token])

    accounts.close()
  })
})

describe('#updatePendingFees', () => {
  beforeEach(() => {
    request.data.gasFeesSource = GasFeesSource.Frame

    storeState().setGasFees('ethereum', parseInt(request.data.chainId), {
      maxBaseFeePerGas: gweiToHex(9),
      maxPriorityFeePerGas: gweiToHex(2)
    })
  })

  it('updates the pending fees for a transaction', () => {
    currentAccount().addRequest(request)
    Accounts.updatePendingFees(parseInt(request.data.chainId))

    expect(requiredCanonicalRequest().data.maxFeePerGas).toBe(gweiToHex(11))
    expect(requiredCanonicalRequest().data.maxPriorityFeePerGas).toBe(gweiToHex(2))
  })

  it('preserves dapp-provided and manually updated fees', () => {
    for (const source of ['dapp', 'manual'] as const) {
      request.data.gasFeesSource = source === 'dapp' ? GasFeesSource.Dapp : GasFeesSource.Frame
      request.feesUpdatedByUser = source === 'manual'
      currentAccount().addRequest(request)
      Accounts.updatePendingFees(parseInt(request.data.chainId))
      expect(request.data.maxFeePerGas).toBe(gweiToHex(9))
      expect(request.data.maxPriorityFeePerGas).toBe(gweiToHex(1))
    }
  })
})

describe('transaction fee editing', () => {
  beforeEach(() => {
    currentAccount().addRequest(request, mock())
  })

  it('shares strict request, lock, and manual-update guards across fee fields', () => {
    for (const invalid of [undefined, 'wrong', '-0x1']) {
      expect(() => Accounts.setBaseFee(invalid as unknown as string, request.handlerId, false)).toThrow(
        /invalid input/i
      )
    }
    expect(() => Accounts.setBaseFee('0x1', '2', false)).toThrow(/could not find transaction/i)

    patchRequest((current) => {
      current.locked = true
    })
    expect(() => Accounts.setBaseFee('0x1', request.handlerId, false)).toThrow(/already been approved/i)
    patchRequest((current) => {
      current.locked = false
      current.feesUpdatedByUser = true
    })
    expect(() => Accounts.setGasPrice('0x61a8', request.handlerId, false)).toThrow(/updated by user/i)
  })

  it('updates each distinct fee representation and records a manual change once', () => {
    patchRequest((current) => {
      current.data.maxFeePerGas = gweiToHex(10)
      current.data.maxPriorityFeePerGas = gweiToHex(2)
    })
    Accounts.setBaseFee(gweiToHex(6), request.handlerId, false)
    expect(requiredCanonicalRequest().data.maxFeePerGas).toBe(gweiToHex(8))

    Accounts.setPriorityFee(gweiToHex(3), request.handlerId, false)
    expect(requiredCanonicalRequest().data.maxPriorityFeePerGas).toBe(gweiToHex(3))

    patchRequest((current) => {
      current.data.type = '0x0'
    })
    Accounts.setGasPrice(gweiToHex(45), request.handlerId, false)
    expect(requiredCanonicalRequest().data.gasPrice).toBe(gweiToHex(45))

    Accounts.setGasPrice('0x61a8', request.handlerId, true)
    expect(canonicalRequest()).toMatchObject({
      feesUpdatedByUser: true,
      data: { gasPrice: '0x61a8' }
    })
  })

  it('applies the field-specific absolute caps', () => {
    Accounts.setBaseFee(gweiToHex(10_200), request.handlerId, false)
    expect(requiredCanonicalRequest().data.maxFeePerGas).toBe(
      intToHex(9_999e9 + parseInt(request.data.maxPriorityFeePerGas ?? '0x0'))
    )

    Accounts.setPriorityFee(gweiToHex(10_200), request.handlerId, false)
    expect(requiredCanonicalRequest().data.maxPriorityFeePerGas).toBe(gweiToHex(9_999))

    patchRequest((current) => {
      current.data.type = '0x0'
    })
    Accounts.setGasPrice(gweiToHex(10_200), request.handlerId, false)
    expect(requiredCanonicalRequest().data.gasPrice).toBe(gweiToHex(9_999))
  })
})

describe('#setTxSent', () => {
  it('keeps activity submitted when asynchronous confirmation monitoring fails', async () => {
    const hash = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
    notificationMock.mockClear()
    provider.send = mock((payload: RPCRequestPayload, cb: RPCRequestCallback) => {
      if (payload.method === 'eth_subscribe') {
        cb(rpcError(-32601, 'subscriptions unavailable'))
      } else if (payload.method === 'eth_blockNumber') {
        cb(rpcError(-32000, 'block lookup failed'))
      } else if (payload.method === 'eth_getTransactionReceipt') {
        cb(rpcError(-32000, 'receipt lookup failed'))
      }
    })

    currentAccount().addRequest(request, mock())
    Accounts.setTxSent(request.handlerId, hash)
    expect(canonicalRequest()).toMatchObject({
      status: 'verifying',
      notice: 'Verifying',
      mode: 'monitor',
      tx: { hash, confirmations: 0 }
    })
    expect(storeState().main.activity[hash]).toMatchObject({ status: 'submitted', hash })

    timers.advanceTimersByTime(1_000)
    for (let index = 0; index < 6; index += 1) {
      await Promise.resolve()
    }

    expect(canonicalRequest()).toMatchObject({ status: 'sent', notice: 'Sent' })
    expect(storeState().main.activity[hash].status).toBe('submitted')
    expect(notificationMock.mock.calls.length).toBe(0)
    timers.advanceTimersByTime(60_000)
    expect(currentAccount().requests[request.handlerId]).toBeUndefined()
    expect(storeState().main.activity[hash].status).toBe('submitted')
  })

  it('saves affected tokens and refreshes transaction positions when the receipt lands', async () => {
    const hash = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const receiptBlock = 100
    const usdc = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
    request.account = account.address
    const simulation: TransactionSimulation = {
      status: 'success',
      effects: [
        {
          id: 'sim-usdc-in',
          kind: 'erc20',
          direction: 'in',
          label: 'Asset in',
          amount: '0x17d7840',
          decimals: 6,
          symbol: 'USDC',
          assetAddress: usdc
        }
      ]
    }
    simulationMock.simulateTransactionEffects.mockResolvedValueOnce(simulation)
    store.setState((state) => {
      state.main.tokens.accountTokenIds[account.address] = []
      delete state.main.tokens.byId[`1:${usdc.toLowerCase()}`]
    })

    mockConfirmedReceipt(receiptBlock)

    externalDataScannerMock.refreshPositions.mockClear()
    Accounts.startDataScanner()
    currentAccount().addRequest(request, mock())
    patchRequest((request) => {
      request.simulation = simulation
    })
    Accounts.setTxSent(request.handlerId, hash)

    const expectedToken = {
      address: usdc.toLowerCase(),
      chainId: 1,
      decimals: 6,
      name: 'USDC',
      symbol: 'USDC'
    }
    const tokenId = `1:${expectedToken.address}`
    expect(storeState().main.tokens.byId[tokenId]).toEqual(
      expect.objectContaining(expectedToken) as unknown as NonNullable<
        ReturnType<typeof storeState>['main']['tokens']['byId'][string]
      >
    )
    expect(storeState().main.tokens.accountTokenIds[account.address]).toContain(tokenId)

    timers.advanceTimersByTime(1000)
    await flushPromises()

    expect(externalDataScannerMock.refreshPositions).toHaveBeenCalledTimes(1)
    expect(externalDataScannerMock.refreshPositions).toHaveBeenCalledWith(account.address, 1, [
      expect.objectContaining(expectedToken) as unknown as typeof expectedToken
    ])
    expect(storeState().main.activity[hash].positionsRefreshedAt).toEqual(
      expect.any(Number) as unknown as number
    )
    expect(storeState().main.activity[hash].balanceChanges).toEqual(
      (simulation.effects ?? []) as NonNullable<ActivityRecord['balanceChanges']>
    )

    Accounts.close()
  })

  it.each([true, false])(
    'keeps allowance effects out of activity with recipient transfer %s',
    async (transfer) => {
      const hash = `0x${(transfer ? 'bc' : 'bd').repeat(32)}`
      const outgoing = {
        id: 'token-out',
        kind: 'erc20',
        direction: 'out',
        label: 'Asset out',
        amount: '0x1',
        decimals: 6,
        symbol: 'USDC'
      } satisfies TransactionEffect
      const incoming = {
        ...outgoing,
        id: 'token-in',
        direction: 'in',
        label: 'Asset in'
      } satisfies TransactionEffect
      const allowance: TransactionEffect = {
        ...outgoing,
        id: 'allowance',
        kind: 'allowance',
        direction: 'neutral',
        label: 'Allowance change'
      }
      const simulation: TransactionSimulation = {
        status: 'success',
        effects: [outgoing, allowance],
        effectsProfileId: DEFAULT_PROFILE_ID,
        effectsByAccount: {
          [account.address]: [outgoing, allowance],
          [account2.address]: transfer ? [incoming, allowance] : [allowance]
        }
      }
      simulationMock.simulateTransactionEffects.mockResolvedValueOnce(simulation)
      mockConfirmedReceipt(100)
      request.account = account.address
      request.handlerId = `allowance-${transfer}`
      currentAccount().addRequest(request, mock())
      patchRequest((request) => {
        request.simulation = simulation
      })
      Accounts.setTxSent(request.handlerId, hash)
      timers.advanceTimersByTime(1000)
      await flushPromises()

      const activity = store.getState().main.activity
      expect(activity[hash].status).toBe('succeeded')
      expect(activity[hash].balanceChanges).toEqual([outgoing])
      ActivityRecordSchema.parse(activity[hash])
      const recipient = activity[`${hash}:${account2.address}`]
      if (transfer) {
        expect(recipient.balanceChanges).toEqual([incoming])
        expect(recipient.display).toEqual({ title: 'Receive USDC', subtitle: 'Incoming transfer' })
        ActivityRecordSchema.parse(recipient)
      } else {
        expect(recipient).toBeUndefined()
      }
    }
  )

  it('confirms after the target confirmation count and removes after the close delay', async () => {
    const hash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
    const receiptBlock = 100
    const clearRequest = spyOn(currentAccount(), 'clearRequest')

    mockConfirmedReceipt(receiptBlock)

    currentAccount().addRequest(request, mock())
    Accounts.setTxSent(request.handlerId, hash)
    timers.advanceTimersByTime(1000)
    await flushPromises()

    expect(currentAccount().requests[request.handlerId]?.status).toBe(RequestStatus.Confirmed)
    const confirmedRequest = currentAccount().getRequest<
      TransactionRequest & { tx: { confirmations: number } }
    >(String(request.handlerId))
    expect(confirmedRequest?.tx.confirmations).toBe(TRANSACTION_CONFIRMATION_TARGET)
    expect(storeState().main.activity[hash].gasSpent).toBe('0x23cfb4e356000')

    timers.advanceTimersByTime(2999)
    expect(clearRequest).not.toHaveBeenCalledWith(request.handlerId)

    timers.advanceTimersByTime(1)
    expect(clearRequest).toHaveBeenCalledWith(request.handlerId)
  })

  it('does not drop a same-nonce request on another chain', async () => {
    const hash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
    const receiptBlock = 100
    const otherChainRequest = {
      ...request,
      handlerId: '2',
      data: {
        ...request.data,
        chainId: '0xa'
      },
      payload: {
        ...request.payload,
        id: 8
      },
      status: RequestStatus.Verifying,
      tx: {
        hash: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        confirmations: 0
      }
    } as unknown as CanonicalAccountRequest

    mockConfirmedReceipt(receiptBlock)

    currentAccount().addRequest(request, mock())
    storeState().upsertAccountRequest(account.address, otherChainRequest)
    Accounts.setTxSent(request.handlerId, hash)
    timers.advanceTimersByTime(1000)
    await flushPromises()

    expect(currentAccount().requests[otherChainRequest.handlerId]?.status).toBe(RequestStatus.Verifying)
  })

  it('opens a queued request after popping the submitted transaction request', () => {
    const hash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
    const queuedRequest = {
      ...request,
      handlerId: '2',
      data: {
        ...request.data,
        nonce: '0xb'
      },
      payload: {
        ...request.payload,
        id: 8
      }
    }

    provider.send = mock()

    currentAccount().addRequest(request, mock())
    store.setState((state) => {
      state.windows.panel.nav = [
        {
          view: 'requestView',
          data: {
            step: 'confirm',
            accountId: account.address,
            requestId: request.handlerId
          }
        }
      ]
    })
    currentAccount().addRequest(queuedRequest, mock())

    Accounts.setTxSent(request.handlerId, hash)

    expect(storeState().windows.panel.nav[0]).toEqual({
      view: 'requestView',
      data: {
        step: 'confirm',
        accountId: account.address,
        requestId: queuedRequest.handlerId
      }
    })
  })

  it('resumes non-terminal persisted activity during initialization', async () => {
    const hash = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    const receiptBlock = 200

    provider.send = mock((payload: RPCRequestPayload, cb: RPCRequestCallback) => {
      if (payload.method === 'eth_getTransactionReceipt') {
        return cb(
          rpcResult({
            status: '0x1',
            blockNumber: intToHex(receiptBlock),
            gasUsed: '0x5208'
          })
        )
      }
      if (payload.method === 'eth_blockNumber') {
        return cb(rpcResult(intToHex(receiptBlock + TRANSACTION_CONFIRMATION_TARGET)))
      }

      cb(rpcResult(null))
    })

    setSubmittedActivity(hash, {
      chainType: 'ethereum',
      submittedAt: Date.now(),
      updatedAt: Date.now(),
      data: { ...request.data, from: account.address, chainId: '0x1' }
    })

    const accounts = createAccounts()
    accounts.initialize()
    await flushPromises(3)

    expect(storeState().main.activity[hash]).toEqual(
      expect.objectContaining({
        status: 'succeeded',
        confirmations: TRANSACTION_CONFIRMATION_TARGET
      }) as unknown as ActivityRecord
    )

    accounts.close()
  })

  it('pauses persisted activity immediately and resumes it once without overlapping RPC', async () => {
    const profileId = 'dormant-activity-profile'
    const hash = '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
    const receiptCallbacks: RPCRequestCallback[] = []
    const accounts = createAccounts()

    storeState().createProfile(profileId, 'Dormant activity')
    storeState().moveAccountToProfile(account2.address, profileId)
    storeState().selectProfile(DEFAULT_PROFILE_ID)
    setSubmittedActivity(hash)
    provider.send = mock((payload: RPCRequestPayload, cb: RPCRequestCallback) => {
      if (payload.method === 'eth_getTransactionReceipt') {
        receiptCallbacks.push(cb)
        return
      }
      if (payload.method === 'eth_blockNumber') {
        cb(rpcResult(intToHex(100 + TRANSACTION_CONFIRMATION_TARGET)))
      }
    })

    try {
      accounts.initialize()
      expect(receiptCallbacks).toHaveLength(1)

      storeState().selectProfile(profileId)
      receiptCallbacks[0](rpcResult({ status: '0x1', blockNumber: intToHex(100), gasUsed: '0x5208' }))
      expect(provider.send.mock.calls.map(([payload]) => payload.method)).toEqual([
        'eth_getTransactionReceipt'
      ])
      expect(storeState().main.activity[hash].status).toBe('submitted')

      storeState().selectProfile(DEFAULT_PROFILE_ID)
      expect(receiptCallbacks).toHaveLength(2)
      timers.advanceTimersByTime(30_000)
      expect(receiptCallbacks).toHaveLength(2)

      receiptCallbacks[1](rpcResult({ status: '0x1', blockNumber: intToHex(100), gasUsed: '0x5208' }))
      await flushPromises()
      expect(storeState().main.activity[hash].status).toBe('succeeded')
    } finally {
      accounts.close()
      store.setState((state) => {
        state.main.activity = {}
      })
      storeState().selectProfile(DEFAULT_PROFILE_ID)
      storeState().moveAccountToProfile(account2.address, DEFAULT_PROFILE_ID)
      storeState().deleteProfile(profileId)
    }
  })

  it('retires a live request monitor on dormancy and resumes from durable activity', () => {
    const profileId = 'dormant-live-profile'
    const hash = '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'
    const accounts = createAccounts()
    const methods: string[] = []

    store.setState((state) => {
      state.main.activity = {}
    })
    storeState().createProfile(profileId, 'Dormant live request')
    storeState().moveAccountToProfile(account2.address, profileId)
    storeState().selectProfile(DEFAULT_PROFILE_ID)
    provider.send = mock((payload: RPCRequestPayload, cb: RPCRequestCallback) => {
      methods.push(payload.method)
      if (payload.method === 'eth_subscribe') {
        cb(rpcResult('head-subscription'))
      } else if (payload.method === 'eth_unsubscribe') {
        cb(rpcResult(true))
      }
    })

    try {
      accounts.initialize()
      const frameAccount = requiredFrameAccount(accounts, account.address)
      frameAccount.addRequest(request, mock())
      accounts.setTxSent(request.handlerId, hash)
      expect(methods).toEqual(['eth_subscribe'])

      storeState().selectProfile(profileId)
      expect(methods).toEqual(['eth_subscribe', 'eth_unsubscribe'])
      timers.advanceTimersByTime(30_000)
      expect(methods).toEqual(['eth_subscribe', 'eth_unsubscribe'])
      expect(storeState().main.activity[hash].status).toBe('submitted')

      storeState().selectProfile(DEFAULT_PROFILE_ID)
      expect(methods).toEqual(['eth_subscribe', 'eth_unsubscribe', 'eth_getTransactionReceipt'])
      timers.advanceTimersByTime(30_000)
      expect(methods).toEqual(['eth_subscribe', 'eth_unsubscribe', 'eth_getTransactionReceipt'])
    } finally {
      accounts.close()
      store.setState((state) => {
        state.main.activity = {}
      })
      storeState().selectProfile(DEFAULT_PROFILE_ID)
      storeState().moveAccountToProfile(account2.address, DEFAULT_PROFILE_ID)
      storeState().deleteProfile(profileId)
    }
  })
})

describe('#clearRequestsByOrigin', () => {
  beforeEach(() => {
    currentAccount().addRequest(request)
    currentAccount().addRequest({ ...request, handlerId: '2' })
    currentAccount().addRequest({ ...request, handlerId: '3', origin: '07h3r' })
  })

  it('should remove any request from a given origin', () => {
    Accounts.clearRequestsByOrigin(account.id, request.origin)
    expect(
      Object.keys(requiredFrameAccount(Accounts, account.id).requests as Record<string, unknown>)
    ).toHaveLength(1)
  })
})
