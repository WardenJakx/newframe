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

import log from 'electron-log'
import { addHexPrefix, intToHex } from '@ethereumjs/util'

import store from '../store'
import { GasFeesSource, TRANSACTION_CONFIRMATION_TARGET } from '../../domain/transaction'
import { DEFAULT_PROFILE_ID } from '../../domain/state/main'
import { gweiToHex } from '../../test/support/util'
import { createAgentPrincipal, createRpcPrincipal } from '../authority'

const providerMock = {
  send: mock(),
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
    if (!callback) return false
    this.pending.delete(requestId)
    callback(response)
    return true
  },
  resolve(request: any, result?: unknown) {
    return this.respond(request.handlerId, {
      id: request.payload.id,
      jsonrpc: request.payload.jsonrpc,
      result
    })
  },
  reject(request: any, error: EVMError) {
    return this.respond(request.handlerId, {
      id: request.payload.id,
      jsonrpc: request.payload.jsonrpc,
      error
    })
  }
}

mock.module('../signers', () => ({ default: signersMock, ...signersMock }))
mock.module('../windows', () => ({ default: windowsMock, ...windowsMock }))
mock.module('../externalData', () => ({
  default: externalDataScannerFactoryMock,
  start: mock(),
  stop: mock()
}))
mock.module('../nameResolution', () => ({
  __esModule: true,
  default: {
    ready: () => true,
    once: mock(),
    reverseLookup: mock()
  }
}))

let provider: any
let Accounts: any
let AccountsClass: any
let maxFee: any

const nameResolutionMock = {
  ready: () => true,
  once: mock(),
  off: mock(),
  reverseLookup: mock()
}
const revealMock = {
  identity: mock(async () => ({ type: '', ens: '' })),
  decode: mock(),
  recog: mock(async () => [])
}
const simulationMock = {
  simulateTransactionEffects: mock(async () => ({ status: 'success' as const, effects: [] }))
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

const storeState = () => store.getState() as any
const canonicalRequest = (id: string | number = request.handlerId) => Accounts.current().requests[id] as any
const patchRequest = (update: (request: any) => void, id: string | number = request.handlerId) =>
  Accounts.current().patchRequest(id, update)
const flushPromises = async (count = 4) => {
  while (count-- > 0) await Promise.resolve()
}
function mockConfirmedReceipt(receiptBlock: number) {
  provider.send = mock((payload: any, cb: any) => {
    if (payload.method === 'eth_subscribe') return cb({ error: { code: -32601, message: 'unsupported' } })
    if (payload.method === 'eth_blockNumber') {
      return cb({ result: intToHex(receiptBlock + TRANSACTION_CONFIRMATION_TARGET) })
    }
    if (payload.method === 'eth_getTransactionReceipt') {
      return cb({ result: { status: '0x1', blockNumber: intToHex(receiptBlock), gasUsed: '0x5208' } })
    }
    cb({ result: null })
  })
}
function setSubmittedActivity(hash: string, overrides: Record<string, unknown> = {}) {
  store.setState((state: any) => {
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

let request: any

beforeAll(async () => {
  log.transports.console.level = false

  provider = providerMock
  maxFee = transactionMock.maxFee
  const accountsModule = await import('./index')
  AccountsClass = accountsModule.Accounts as any
  Accounts = createAccounts()
})

afterAll(() => {
  Accounts.dispose()
  log.transports.console.level = 'debug'
})

beforeEach((done) => {
  timers.useFakeTimers()
  requestLifecycle.pending.clear()
  request = {
    handlerId: 1,
    origin: '0r161n',
    type: 'transaction',
    data: {
      from: accountAddress,
      chainId: '0x1',
      gasLimit: intToHex(21000),
      gasPrice: gweiToHex(30),
      type: '0x2',
      maxPriorityFeePerGas: gweiToHex(1),
      maxFeePerGas: gweiToHex(9),
      nonce: '0xa'
    },
    payload: {
      jsonrpc: '2.0',
      id: 7,
      method: 'eth_signTransaction',
      params: [{ from: accountAddress, nonce: '0xa' }]
    }
  }

  Accounts.add(account2.address, 'Test Account 2')
  Accounts.add(account.address, 'Test Account 1', account, (err: any, account: any) => {
    Accounts.setSigner(account.address, done)
  })
})

afterEach(() => {
  Object.values(Accounts.accounts).forEach((account: any) => {
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
        actionId: expect.any(String),
        decision: 'prompt',
        decidedAt: expect.any(Number),
        principal: {
          kind: 'rpc',
          transport: 'http',
          connectionId: 'accounts-test',
          origin: 'app.example'
        }
      }
    })
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

    expect(Accounts.routeRequest(forgedPrincipal as any, { ...request, account: account.address })).toBe(
      false
    )
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
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        authorization: expect.objectContaining({ decision: 'autonomous' })
      })
    )
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
  store.setState((state: any) => {
    state.main.accountOrder = [account2.address, account.address]
  })

  Accounts.remove(account.address)

  expect(Accounts.current().address).toBe(account2.address)
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

  const removedAccount = Accounts.current()
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
  Accounts.getFrameAccount(account.address).addRequest(pendingRequest)
  storeState().moveAccountToProfile(account.address, DEFAULT_PROFILE_ID)
  storeState().deleteProfile(profileId)

  expect(storeState().main.profiles[profileId]).toBeUndefined()
  expect(Accounts.getFrameAccount(account.address).requests[pendingRequest.handlerId]).toBeTruthy()
  Accounts.getFrameAccount(account.address).resolveRequest(pendingRequest, 'profile result')
  expect(respond.mock.calls).toEqual([[{ id: 7, jsonrpc: '2.0', result: 'profile result' }]])
})

it('uses canonical request state for signing success and transaction failure without activity', () => {
  const frameAccount = Accounts.getFrameAccount(account.address)
  const signature = {
    handlerId: 'signature-transition',
    type: 'sign',
    origin: 'test-origin',
    account: account.address,
    payload: {
      id: 20,
      jsonrpc: '2.0',
      method: 'personal_sign',
      params: ['0x01', account.address]
    }
  }
  frameAccount.addRequest(signature, mock())
  Accounts.setRequestPending(signature)
  expect(frameAccount.requests[signature.handlerId]).toMatchObject({
    status: 'pending',
    notice: 'See Signer'
  })
  Accounts.setRequestSuccess(signature.handlerId)
  expect(frameAccount.requests[signature.handlerId]).toMatchObject({
    status: 'success',
    notice: 'Successful',
    mode: 'normal'
  })
  timers.advanceTimersByTime(3_300)
  expect(frameAccount.requests[signature.handlerId]).toBeUndefined()

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
  expect(frameAccount.requests[transaction.handlerId].mode).toBe('monitor')
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
    store.setState((state: any) => {
      state.main.accounts = {}
    })
    const accounts = createAccounts()

    expect(accounts.accounts[account.address]).toBeUndefined()

    store.setState((state: any) => {
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
    expect(storeState().main.tokens.byId[tokenId]).toEqual(expect.objectContaining(token))
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
    Accounts.current().addRequest(request)
    Accounts.updatePendingFees(parseInt(request.data.chainId))

    expect(canonicalRequest().data.maxFeePerGas).toBe(gweiToHex(11))
    expect(canonicalRequest().data.maxPriorityFeePerGas).toBe(gweiToHex(2))
  })

  it('preserves dapp-provided and manually updated fees', () => {
    for (const source of ['dapp', 'manual'] as const) {
      request.data.gasFeesSource = source === 'dapp' ? GasFeesSource.Dapp : GasFeesSource.Frame
      request.feesUpdatedByUser = source === 'manual'
      Accounts.current().addRequest(request)
      Accounts.updatePendingFees(parseInt(request.data.chainId))
      expect(request.data.maxFeePerGas).toBe(gweiToHex(9))
      expect(request.data.maxPriorityFeePerGas).toBe(gweiToHex(1))
    }
  })
})

describe('transaction fee editing', () => {
  beforeEach(() => {
    Accounts.current().addRequest(request, mock())
  })

  it('shares strict request, lock, and manual-update guards across fee fields', () => {
    for (const invalid of [undefined, 'wrong', '-0x1']) {
      expect(() => Accounts.setBaseFee(invalid, 1, false)).toThrow(/invalid input/i)
    }
    expect(() => Accounts.setBaseFee('0x1', 2, false)).toThrow(/could not find transaction/i)

    patchRequest((current) => {
      current.locked = true
    })
    expect(() => Accounts.setBaseFee('0x1', 1, false)).toThrow(/already been approved/i)
    patchRequest((current) => {
      current.locked = false
      current.feesUpdatedByUser = true
    })
    expect(() => Accounts.setGasLimit('0x61a8', 1, false)).toThrow(/updated by user/i)
  })

  it('updates each distinct fee representation and records a manual change once', () => {
    patchRequest((current) => {
      current.data.maxFeePerGas = gweiToHex(10)
      current.data.maxPriorityFeePerGas = gweiToHex(2)
    })
    Accounts.setBaseFee(gweiToHex(6), 1, false)
    expect(canonicalRequest().data.maxFeePerGas).toBe(gweiToHex(8))

    Accounts.setPriorityFee(gweiToHex(3), 1, false)
    expect(canonicalRequest().data.maxPriorityFeePerGas).toBe(gweiToHex(3))

    patchRequest((current) => {
      current.data.type = '0x0'
    })
    Accounts.setGasPrice(gweiToHex(45), 1, false)
    expect(canonicalRequest().data.gasPrice).toBe(gweiToHex(45))

    Accounts.setGasLimit('0x61a8', 1, true)
    expect(canonicalRequest()).toMatchObject({
      feesUpdatedByUser: true,
      data: { gasLimit: '0x61a8' }
    })
  })

  it('applies the field-specific absolute caps', () => {
    Accounts.setBaseFee(gweiToHex(10_200), 1, false)
    expect(canonicalRequest().data.maxFeePerGas).toBe(
      intToHex(9_999e9 + parseInt(request.data.maxPriorityFeePerGas))
    )

    Accounts.setPriorityFee(gweiToHex(10_200), 1, false)
    expect(canonicalRequest().data.maxPriorityFeePerGas).toBe(gweiToHex(9_999))

    patchRequest((current) => {
      current.data.type = '0x0'
    })
    Accounts.setGasPrice(gweiToHex(10_200), 1, false)
    expect(canonicalRequest().data.gasPrice).toBe(gweiToHex(9_999))

    Accounts.setGasLimit(intToHex(13e6), 1, false)
    expect(canonicalRequest().data.gasLimit).toBe(intToHex(12.5e6))
  })

  it('caps legacy and EIP-1559 totals at the chain budget', () => {
    const maxTotalFee = 2e18
    const price = 400e9
    const maxLimit = maxTotalFee / price
    ;(maxFee as any).mockReturnValue(maxTotalFee)

    patchRequest((current) => {
      current.data.type = '0x0'
      current.data.gasPrice = intToHex(price)
    })
    Accounts.setGasLimit(intToHex(maxLimit + 1e5), 1, false)
    expect(canonicalRequest().data.gasLimit).toBe(intToHex(maxLimit))

    patchRequest((current) => {
      current.data.type = '0x2'
      current.data.maxFeePerGas = intToHex(price)
    })
    Accounts.setGasLimit(intToHex(maxLimit + 1e5), 1, false)
    expect(canonicalRequest().data.gasLimit).toBe(intToHex(maxLimit))
  })
})

describe('#adjustNonce', () => {
  let onChainNonce: any

  beforeEach(() => {
    provider.send = mock((payload: any, cb: any) => {
      expect(payload).toEqual(
        expect.objectContaining({
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_getTransactionCount',
          params: ['0x22dd63c3619818fdbc262c78baee43cb61e9cccf', 'pending']
        })
      )

      cb({ result: onChainNonce })
    })

    onChainNonce = '0x0'
    Accounts.current().addRequest(request, mock())
  })

  const adjustNonce = (nonceAdjust: any, requestId = 1) => Accounts.adjustNonce(requestId, nonceAdjust)

  it('does not allow an invalid adjustment', () => {
    adjustNonce(2)

    expect((Accounts.current().requests[1] as any).data.nonce).toBe(request.data.nonce)
  })

  it('does not adjust a request if no account is active', () => {
    Accounts.setSigner(undefined, mock())
    adjustNonce(1)

    expect(storeState().main.accounts[account.address].requests[1].data.nonce).toBe(request.data.nonce)
  })
  ;[
    ['provided nonce up', false, 1],
    ['provided nonce down', false, -1],
    ['latest chain nonce', true, 1],
    ['latest chain nonce down', true, -1]
  ].forEach(([description, fromChain, adjustment]) => {
    it(`adjusts the ${description}`, () => {
      if (fromChain) {
        onChainNonce = '0x5'
        patchRequest((current) => delete current.data.nonce)
      }
      const source = fromChain ? onChainNonce : request.data.nonce
      adjustNonce(adjustment)
      expect(canonicalRequest().data.nonce).toBe(
        addHexPrefix(
          (
            parseInt(source) + (fromChain ? Math.min(adjustment as number, 0) : (adjustment as number))
          ).toString(16)
        )
      )
    })
  })
})

describe('#resetNonce', () => {
  beforeEach(() => {
    provider.send = mock((payload: any, cb: any) => {
      expect(payload).toEqual(
        expect.objectContaining({
          id: 1,
          jsonrpc: '2.0',
          method: 'eth_getTransactionCount',
          params: ['0x22dd63c3619818fdbc262c78baee43cb61e9cccf', 'pending']
        })
      )
      cb({ result: '0x3' })
    })
    request.data.nonce = '0x5'
    Accounts.current().addRequest(request, mock())
  })

  const resetNonce = (requestId = 1) => Accounts.resetNonce(requestId)

  it('it will un-set the nonce when not present inside the tx request payload', () => {
    patchRequest((request) => {
      delete request.payload.params[0].nonce
    })
    resetNonce()
    expect(canonicalRequest().data.nonce).toBe(undefined)
  })

  it('it will revert to the nonce inside the tx request payload when present', () => {
    const initialNonce = canonicalRequest().data.nonce
    patchRequest((request) => {
      request.payload.params[0].nonce = '0x' + (BigInt(initialNonce) - 1n).toString(16)
    })
    resetNonce()
    expect(canonicalRequest().data.nonce).toBe(canonicalRequest().payload.params[0].nonce)
  })
})

describe('#setTxSent', () => {
  it('keeps activity submitted when asynchronous confirmation monitoring fails', async () => {
    const hash = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
    notificationMock.mockClear()
    provider.send = mock((payload: any, cb: any) => {
      if (payload.method === 'eth_subscribe') {
        cb({ error: { code: -32601, message: 'subscriptions unavailable' } })
      } else if (payload.method === 'eth_blockNumber') {
        cb({ error: { code: -32000, message: 'block lookup failed' } })
      } else if (payload.method === 'eth_getTransactionReceipt') {
        cb({ error: { code: -32000, message: 'receipt lookup failed' } })
      }
    })

    Accounts.current().addRequest(request, mock())
    Accounts.setTxSent(request.handlerId, hash)
    expect(canonicalRequest()).toMatchObject({
      status: 'verifying',
      notice: 'Verifying',
      mode: 'monitor',
      tx: { hash, confirmations: 0 }
    })
    expect(storeState().main.activity[hash]).toMatchObject({ status: 'submitted', hash })

    timers.advanceTimersByTime(1_000)
    for (let index = 0; index < 6; index += 1) await Promise.resolve()

    expect(canonicalRequest()).toMatchObject({ status: 'sent', notice: 'Sent' })
    expect(storeState().main.activity[hash].status).toBe('submitted')
    expect(notificationMock.mock.calls.length).toBe(0)
    timers.advanceTimersByTime(60_000)
    expect(Accounts.current().requests[request.handlerId]).toBeUndefined()
    expect(storeState().main.activity[hash].status).toBe('submitted')
  })

  it('saves affected tokens and refreshes transaction positions when the receipt lands', async () => {
    const hash = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    const receiptBlock = 100
    const usdc = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
    request.account = account.address
    const simulation = {
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
    store.setState((state: any) => {
      state.main.tokens.accountTokenIds[account.address] = []
      delete state.main.tokens.byId[`1:${usdc.toLowerCase()}`]
    })

    mockConfirmedReceipt(receiptBlock)

    Accounts.startDataScanner()
    Accounts.current().addRequest(request, mock())
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
    expect(storeState().main.tokens.byId[tokenId]).toEqual(expect.objectContaining(expectedToken))
    expect(storeState().main.tokens.accountTokenIds[account.address]).toContain(tokenId)

    timers.advanceTimersByTime(1000)
    await flushPromises()

    expect(externalDataScannerMock.refreshPositions).toHaveBeenCalledTimes(1)
    expect(externalDataScannerMock.refreshPositions).toHaveBeenCalledWith(account.address, 1, [
      expect.objectContaining(expectedToken)
    ])
    expect(storeState().main.activity[hash].positionsRefreshedAt).toEqual(expect.any(Number))

    Accounts.close()
  })

  it('confirms after the target confirmation count and removes after the close delay', async () => {
    const hash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
    const receiptBlock = 100
    const clearRequest = spyOn(Accounts.current(), 'clearRequest')

    mockConfirmedReceipt(receiptBlock)

    Accounts.current().addRequest(request, mock())
    Accounts.setTxSent(request.handlerId, hash)
    timers.advanceTimersByTime(1000)
    await flushPromises()

    expect((Accounts.current().requests[request.handlerId] as any).status).toBe('confirmed')
    expect((Accounts.current().requests[request.handlerId] as any).tx.confirmations).toBe(
      TRANSACTION_CONFIRMATION_TARGET
    )

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
      handlerId: 2,
      data: {
        ...request.data,
        chainId: '0xa'
      },
      payload: {
        ...request.payload,
        id: 8
      },
      status: 'verifying',
      tx: {
        hash: '0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd',
        confirmations: 0
      }
    }

    mockConfirmedReceipt(receiptBlock)

    Accounts.current().addRequest(request, mock())
    storeState().upsertAccountRequest(account.address, otherChainRequest)
    Accounts.setTxSent(request.handlerId, hash)
    timers.advanceTimersByTime(1000)
    await flushPromises()

    expect((Accounts.current().requests[otherChainRequest.handlerId] as any).status).toBe('verifying')
  })

  it('opens a queued request after popping the submitted transaction request', () => {
    const hash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
    const queuedRequest = {
      ...request,
      handlerId: 2,
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

    Accounts.current().addRequest(request, mock())
    store.setState((state: any) => {
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
    Accounts.current().addRequest(queuedRequest, mock())

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

    provider.send = mock((payload: any, cb: any) => {
      if (payload.method === 'eth_getTransactionReceipt') {
        return cb({
          result: {
            status: '0x1',
            blockNumber: intToHex(receiptBlock),
            gasUsed: '0x5208'
          }
        })
      }
      if (payload.method === 'eth_blockNumber')
        return cb({ result: intToHex(receiptBlock + TRANSACTION_CONFIRMATION_TARGET) })

      cb({ result: null })
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
      })
    )

    accounts.close()
  })

  it('pauses persisted activity immediately and resumes it once without overlapping RPC', async () => {
    const profileId = 'dormant-activity-profile'
    const hash = '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
    const receiptCallbacks: Array<(response: any) => void> = []
    const accounts = createAccounts()

    storeState().createProfile(profileId, 'Dormant activity')
    storeState().moveAccountToProfile(account2.address, profileId)
    storeState().selectProfile(DEFAULT_PROFILE_ID)
    setSubmittedActivity(hash)
    provider.send = mock((payload: any, cb: any) => {
      if (payload.method === 'eth_getTransactionReceipt') {
        receiptCallbacks.push(cb)
        return
      }
      if (payload.method === 'eth_blockNumber') {
        cb({ result: intToHex(100 + TRANSACTION_CONFIRMATION_TARGET) })
      }
    })

    try {
      accounts.initialize()
      expect(receiptCallbacks).toHaveLength(1)

      storeState().selectProfile(profileId)
      receiptCallbacks[0]({ result: { status: '0x1', blockNumber: intToHex(100), gasUsed: '0x5208' } })
      expect(provider.send.mock.calls.map(([payload]: any[]) => payload.method)).toEqual([
        'eth_getTransactionReceipt'
      ])
      expect(storeState().main.activity[hash].status).toBe('submitted')

      storeState().selectProfile(DEFAULT_PROFILE_ID)
      expect(receiptCallbacks).toHaveLength(2)
      timers.advanceTimersByTime(30_000)
      expect(receiptCallbacks).toHaveLength(2)

      receiptCallbacks[1]({ result: { status: '0x1', blockNumber: intToHex(100), gasUsed: '0x5208' } })
      await flushPromises()
      expect(storeState().main.activity[hash].status).toBe('succeeded')
    } finally {
      accounts.close()
      store.setState((state: any) => {
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

    store.setState((state: any) => {
      state.main.activity = {}
    })
    storeState().createProfile(profileId, 'Dormant live request')
    storeState().moveAccountToProfile(account2.address, profileId)
    storeState().selectProfile(DEFAULT_PROFILE_ID)
    provider.send = mock((payload: any, cb: any) => {
      methods.push(payload.method)
      if (payload.method === 'eth_subscribe') cb({ result: 'head-subscription' })
      else if (payload.method === 'eth_unsubscribe') cb({ result: true })
    })

    try {
      accounts.initialize()
      const frameAccount = accounts.getFrameAccount(account.address)
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
      store.setState((state: any) => {
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
    Accounts.current().addRequest(request)
    Accounts.current().addRequest({ ...request, handlerId: '2' })
    Accounts.current().addRequest({ ...request, handlerId: '3', origin: '07h3r' })
  })

  it('should remove any request from a given origin', () => {
    Accounts.clearRequestsByOrigin(account.id, request.origin)
    expect(Object.keys(Accounts.accounts[account.id].requests)).toHaveLength(1)
  })
})
