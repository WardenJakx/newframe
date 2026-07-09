import log from 'electron-log'
import { addHexPrefix, intToHex } from '@ethereumjs/util'

import store from '../../../main/store'
import { GasFeesSource, TRANSACTION_CONFIRMATION_TARGET } from '../../../resources/domain/transaction'
import { gweiToHex } from '../../util'

const providerMock = { send: jest.fn(), emit: jest.fn(), on: jest.fn(), off: jest.fn() }
const signersMock = { get: jest.fn() }
const windowsMock = { broadcast: jest.fn(), showTray: jest.fn() }
const navMock = { on: jest.fn(), forward: jest.fn() }
const externalDataScannerMock = {
  refreshBalances: jest.fn(),
  close: jest.fn()
}
const externalDataScannerFactoryMock = jest.fn(() => externalDataScannerMock)
const transactionMock = {
  addTransaction: jest.fn(),
  maxFee: jest.fn(() => 1e30),
  signerCompatibility: jest.fn()
}

jest.mock('../../../main/provider', () => ({ default: providerMock, ...providerMock }))
jest.mock('../../../main/signers', () => ({ default: signersMock, ...signersMock }))
jest.mock('../../../main/windows', () => ({ default: windowsMock, ...windowsMock }))
jest.mock('../../../main/windows/nav', () => ({ default: navMock, ...navMock }))
jest.mock('../../../main/externalData', () => ({
  default: externalDataScannerFactoryMock,
  start: jest.fn(),
  stop: jest.fn()
}))
jest.mock('../../../main/transaction', () => transactionMock)

jest.mock('../../../main/nameResolution', () => ({
  __esModule: true,
  default: {
    ready: () => true,
    once: jest.fn(),
    reverseLookup: jest.fn()
  }
}))

let provider: any
let Accounts: any
let AccountsClass: any
let signers: any
let signerCompatibility: any
let maxFee: any

const account = {
  id: '0x22dd63c3619818fdbc262c78baee43cb61e9cccf',
  name: 'Seed Account',
  lastSignerType: 'seed',
  address: '0x22dd63c3619818fdbc262c78baee43cb61e9cccf',
  status: 'ok',
  signer: '3935336131653838663031303266613139373335616337626261373962343231',
  requests: {},
  ensName: null,
  tokens: {},
  created: '12819530:1626189153547'
}

const account2 = {
  id: '0xef8f1bbe054ad30c6af774ed7a7c70a74ef77ac5',
  name: 'Ledger Account',
  lastSignerType: 'ledger',
  address: '0xef8f1bbe054ad30c6af774ed7a7c70a74ef77ac5',
  status: 'ok',
  active: false,
  signer: '',
  requests: {},
  ensName: '',
  created: '15315799:1660153882707'
}

let request: any

beforeAll(async () => {
  log.transports.console.level = false

  provider = (await import('../../../main/provider')).default
  signers = (await import('../../../main/signers')).default
  const transaction = await import('../../../main/transaction')
  signerCompatibility = transaction.signerCompatibility
  maxFee = transaction.maxFee
  const accountsModule = await import('../../../main/accounts')
  Accounts = accountsModule.default as any
  AccountsClass = accountsModule.Accounts as any
})

afterAll(() => {
  log.transports.console.level = 'debug'
})

beforeEach((done) => {
  const from = '0x22dd63c3619818fdbc262c78baee43cb61e9cccf'
  const nonce = '0xa'
  request = {
    handlerId: 1,
    origin: '0r161n',
    type: 'transaction',
    data: {
      from,
      chainId: '0x1',
      gasLimit: intToHex(21000),
      gasPrice: gweiToHex(30),
      type: '0x2',
      maxPriorityFeePerGas: gweiToHex(1),
      maxFeePerGas: gweiToHex(9),
      nonce
    },
    payload: {
      jsonrpc: '2.0',
      id: 7,
      method: 'eth_signTransaction',
      params: [{ from, nonce }]
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
})

it('sets the account signer', () => {
  expect(Accounts.current().address).toBe('0x22dd63c3619818fdbc262c78baee43cb61e9cccf')
})

it('selects the first remaining account when removing the current account', () => {
  store.set('main.accountOrder', [account2.address, account.address])

  Accounts.remove(account.address)

  expect(Accounts.current().address).toBe(account2.address)
  expect(store('main.currentAccount')).toBe(account2.address)
  expect(store('selected.current')).toBe(account2.address)
  expect(store('main.accounts', account.address)).toBeUndefined()
})

it('clears the selected account when removing the last account', () => {
  Accounts.remove(account2.address)
  Accounts.remove(account.address)

  expect(Accounts.current()).toBeNull()
  expect(store('main.currentAccount')).toBe('')
  expect(store('selected.current')).toBe('')
})

describe('#startDataScanner', () => {
  it('does not start the external data scanner during construction', () => {
    new AccountsClass()

    expect(externalDataScannerFactoryMock).not.toHaveBeenCalled()
  })

  it('starts the external data scanner once', () => {
    const accounts = new AccountsClass()

    accounts.startDataScanner()
    accounts.startDataScanner()

    expect(externalDataScannerFactoryMock).toHaveBeenCalledTimes(1)
  })

  it('ignores balance refreshes before the external data scanner has started', () => {
    const accounts = new AccountsClass()

    accounts.refreshBalances(account.address)

    expect(externalDataScannerFactoryMock).not.toHaveBeenCalled()
    expect(externalDataScannerMock.refreshBalances).not.toHaveBeenCalled()
  })

  it('closes safely before the external data scanner has started', () => {
    const accounts = new AccountsClass()

    expect(() => accounts.close()).not.toThrow()
    expect(externalDataScannerMock.close).not.toHaveBeenCalled()
  })
})

describe('#updatePendingFees', () => {
  beforeEach(() => {
    request.data.gasFeesSource = GasFeesSource.Frame

    store.setGasFees('ethereum', parseInt(request.data.chainId), {
      maxBaseFeePerGas: gweiToHex(9),
      maxPriorityFeePerGas: gweiToHex(2)
    })
  })

  it('updates the pending fees for a transaction', () => {
    Accounts.addRequest(request)
    Accounts.updatePendingFees(parseInt(request.data.chainId))

    expect(request.data.maxFeePerGas).toBe(gweiToHex(11))
    expect(request.data.maxPriorityFeePerGas).toBe(gweiToHex(2))
  })

  it('does not update a transaction with gas fees provided by a dapp', () => {
    request.data.gasFeesSource = GasFeesSource.Dapp

    Accounts.addRequest(request)
    Accounts.updatePendingFees(parseInt(request.data.chainId))

    expect(request.data.maxFeePerGas).toBe(gweiToHex(9))
    expect(request.data.maxPriorityFeePerGas).toBe(gweiToHex(1))
  })

  it('does not update a transaction if gas fees have been updated by the user', () => {
    request.feesUpdatedByUser = true

    Accounts.addRequest(request)
    Accounts.updatePendingFees(parseInt(request.data.chainId))

    expect(request.data.maxFeePerGas).toBe(gweiToHex(9))
    expect(request.data.maxPriorityFeePerGas).toBe(gweiToHex(1))
  })
})

describe('#setBaseFee', () => {
  beforeEach(() => {
    Accounts.addRequest(request, jest.fn())
  })

  const setBaseFee = (baseFee: any, requestId = 1, userUpdate = false) =>
    Accounts.setBaseFee(baseFee, requestId, userUpdate)

  it('does not set an undefined base fee', () => {
    expect(() => setBaseFee(undefined)).toThrow()
  })

  it('does not set an invalid base fee', () => {
    expect(() => setBaseFee('wrong')).toThrow()
  })

  it('does not set a negative base fee', () => {
    expect(() => setBaseFee('-0x12a05f200')).toThrow()
  })

  it('does not set a base fee for an inactive account', () => {
    Accounts.setSigner(undefined, jest.fn())

    expect(() => setBaseFee('0x1dcd65000')).toThrow(/no account selected/i)
  })

  it('fails to find the request', () => {
    expect(() => setBaseFee('0x1dcd65000', 2)).toThrow(/could not find transaction/i)
  })

  it('does not set a base fee on a non-transaction request', () => {
    request.type = 'message'

    expect(() => setBaseFee('0x1dcd65000')).toThrow()
  })

  it('does not set a base fee on a locked request', () => {
    request.locked = true

    expect(() => setBaseFee('0x1dcd65000')).toThrow()
    expect((Accounts.current().requests[1] as any).data.maxFeePerGas).toBe(request.data.maxFeePerGas)
  })

  it('does not set a base fee on an automatic update if fees were manually set by the user', () => {
    request.feesUpdatedByUser = true

    expect(() => setBaseFee('0x1dcd65000')).toThrow()
    expect((Accounts.current().requests[1] as any).data.maxFeePerGas).toBe(request.data.maxFeePerGas)
  })

  it('applies automatic base fee update', () => {
    request.data.maxFeePerGas = gweiToHex(10)
    request.data.maxPriorityFeePerGas = gweiToHex(2)

    const updatedBaseFee = 6 // gwei

    setBaseFee(gweiToHex(updatedBaseFee))

    expect((Accounts.current().requests[1] as any).data.maxFeePerGas).toBe(
      intToHex(2e9 + updatedBaseFee * 1e9)
    )
  })

  it('applies user-initiated base fee update', () => {
    request.data.maxFeePerGas = gweiToHex(10)
    request.data.maxPriorityFeePerGas = gweiToHex(2)

    setBaseFee(gweiToHex(6), 1, true)

    expect((Accounts.current().requests[1] as any).data.maxFeePerGas).toBe(gweiToHex(8))
  })

  it('does not update if the base fee has not changed', () => {
    request.data.maxFeePerGas = gweiToHex(10)
    request.data.maxPriorityFeePerGas = gweiToHex(2)

    setBaseFee(gweiToHex(8))

    expect((Accounts.current().requests[1] as any).data.maxFeePerGas).toBe(gweiToHex(10))
  })

  it('caps the base fee at 9999 gwei', () => {
    const highBaseFee = gweiToHex(10200)
    const maxBaseFee = 9999e9
    const expectedMaxFee = intToHex(maxBaseFee + parseInt(request.data.maxPriorityFeePerGas))

    setBaseFee(highBaseFee)

    expect((Accounts.current().requests[1] as any).data.maxFeePerGas).toBe(expectedMaxFee)
  })

  it('does not exceed the max allowable fee', () => {
    const maxTotal = 2e18 // 2 ETH
    const gasLimit = 1e7
    const maxTotalFee = maxTotal / gasLimit
    const highBaseFee = intToHex(maxTotalFee + 10e9) // add 10 gwei to exceed the maximum limit

    request.data.gasLimit = intToHex(gasLimit)
    ;(maxFee as any).mockReturnValue(maxTotal)

    setBaseFee(highBaseFee)

    expect((Accounts.current().requests[1] as any).data.maxFeePerGas).toBe(intToHex(maxTotalFee))
  })

  it('updates the feesUpdatedByUser flag', () => {
    request.data.maxFeePerGas = gweiToHex(10)
    request.data.maxPriorityFeePerGas = gweiToHex(2)

    setBaseFee(gweiToHex(10), 1, true)

    expect((Accounts.current().requests[1] as any).feesUpdatedByUser).toBe(true)
  })
})

describe('#setPriorityFee', () => {
  beforeEach(() => {
    Accounts.addRequest(request, jest.fn())
  })

  const setPriorityFee = (fee: any, requestId = 1, userUpdate = false) =>
    Accounts.setPriorityFee(fee, requestId, userUpdate)

  it('does not set an undefined priority fee', () => {
    expect(() => setPriorityFee(undefined)).toThrow()
  })

  it('does not set an invalid priority fee', () => {
    expect(() => setPriorityFee('incorrect')).toThrow()
  })

  it('does not set a negative priority fee', () => {
    expect(() => setPriorityFee('-0x12a05f200')).toThrow()
  })

  it('does not set a priority fee if no account is active', () => {
    Accounts.setSigner(undefined, jest.fn())

    expect(() => setPriorityFee('0x12a05f200')).toThrow(/no account selected/i)
  })

  it('fails to find the request', () => {
    expect(() => setPriorityFee('0x12a05f200', 2)).toThrow(/could not find transaction/i)
  })

  it('does not set a priority fee on a non-transaction request', () => {
    request.type = 'message'

    expect(() => setPriorityFee('0x12a05f200')).toThrow()
  })

  it('does not set a priority fee on a locked request', () => {
    request.locked = true

    expect(() => setPriorityFee('0x12a05f200')).toThrow()
    expect((Accounts.current().requests[1] as any).data.maxFeePerGas).toBe(request.data.maxFeePerGas)
  })

  it('does not set a priority fee on an automatic update if fees were manually set by the user', () => {
    request.feesUpdatedByUser = true

    expect(() => setPriorityFee('0x12a05f200')).toThrow()
    expect((Accounts.current().requests[1] as any).data.maxFeePerGas).toBe(request.data.maxFeePerGas)
  })

  it('sets a valid priority fee', () => {
    const priorityFee = 2e9 // 2 gwei
    const priorityFeeChange = priorityFee - parseInt(request.data.maxPriorityFeePerGas)
    const expectedMaxFee = intToHex(priorityFeeChange + parseInt(request.data.maxFeePerGas))

    setPriorityFee(intToHex(priorityFee))

    expect((Accounts.current().requests[1] as any).data.maxPriorityFeePerGas).toBe(intToHex(priorityFee))
    expect((Accounts.current().requests[1] as any).data.maxFeePerGas).toBe(expectedMaxFee)
  })

  it('does not update if the priority fee has not changed', () => {
    request.data.maxFeePerGas = gweiToHex(10)
    request.data.maxPriorityFeePerGas = gweiToHex(2)

    setPriorityFee(gweiToHex(2))

    expect((Accounts.current().requests[1] as any).data.maxFeePerGas).toBe(gweiToHex(10))
    expect((Accounts.current().requests[1] as any).data.maxPriorityFeePerGas).toBe(gweiToHex(2))
  })

  it('caps the priority fee at 9999 gwei', () => {
    const highPriorityFee = gweiToHex(10200)
    const maxPriorityFee = 9999e9
    const priorityFeeChange = maxPriorityFee - parseInt(request.data.maxPriorityFeePerGas)
    const expectedMaxFee = intToHex(priorityFeeChange + parseInt(request.data.maxFeePerGas))

    setPriorityFee(highPriorityFee)

    expect((Accounts.current().requests[1] as any).data.maxPriorityFeePerGas).toBe(intToHex(maxPriorityFee))
    expect((Accounts.current().requests[1] as any).data.maxFeePerGas).toBe(expectedMaxFee)
  })

  it('does not exceed the max allowable fee', () => {
    const maxTotal = 2e18 // 2 ETH
    const gasLimit = 1e7
    const maxTotalFee = maxTotal / gasLimit

    request.data.gasLimit = intToHex(gasLimit)
    request.data.maxFeePerGas = gweiToHex(190)
    request.data.maxPriorityFeePerGas = gweiToHex(40)
    ;(maxFee as any).mockReturnValue(maxTotal)

    const highPriorityFee = 60e9 // add 20 gwei to the above to exceed the maximum limit
    const expectedPriorityFee =
      maxTotalFee - (parseInt(request.data.maxFeePerGas) - parseInt(request.data.maxPriorityFeePerGas))

    setPriorityFee(highPriorityFee)

    expect((Accounts.current().requests[1] as any).data.maxPriorityFeePerGas).toBe(
      intToHex(expectedPriorityFee)
    )
    expect((Accounts.current().requests[1] as any).data.maxFeePerGas).toBe(intToHex(maxTotalFee))
  })

  it('updates the feesUpdatedByUser flag', () => {
    setPriorityFee('0x12a05f200', 1, true)

    expect((Accounts.current().requests[1] as any).feesUpdatedByUser).toBe(true)
  })
})

describe('#setGasPrice', () => {
  beforeEach(() => {
    Accounts.addRequest(request, jest.fn())
    request.data.type = '0x0'
  })

  const setGasPrice = (price: any, requestId = 1, userUpdate = false) =>
    Accounts.setGasPrice(price, requestId, userUpdate)

  it('does not set an undefined gas price', () => {
    expect(() => setGasPrice(undefined)).toThrow()
  })

  it('does not set an invalid gas price', () => {
    expect(() => setGasPrice(Number.NaN)).toThrow()
  })

  it('does not set a negative gas price', () => {
    expect(() => setGasPrice('-0x23')).toThrow()
  })

  it('does not set a gas price if no account is active', () => {
    Accounts.setSigner(undefined, jest.fn())

    expect(() => setGasPrice('0x23')).toThrow(/no account selected/i)
  })

  it('fails to find the request', () => {
    expect(() => setGasPrice('0x23', 2)).toThrow(/could not find transaction/i)
  })

  it('does not set a gas price on a non-transaction request', () => {
    request.type = 'message'

    expect(() => setGasPrice('0x23')).toThrow()
  })

  it('does not set a gas price on a locked request', () => {
    request.locked = true

    expect(() => setGasPrice('0x23')).toThrow()
    expect((Accounts.current().requests[1] as any).data.gasPrice).toBe(request.data.gasPrice)
  })

  it('does not set a gas price on an automatic update if fees were manually set by the user', () => {
    request.feesUpdatedByUser = true

    expect(() => setGasPrice('0x23')).toThrow()
    expect((Accounts.current().requests[1] as any).data.gasPrice).toBe(request.data.gasPrice)
  })

  it('sets a valid gas price', () => {
    setGasPrice('0x23')

    expect((Accounts.current().requests[1] as any).data.gasPrice).toBe('0x23')
  })

  it('does not update if the gas price has not changed', () => {
    request.data.gasPrice = gweiToHex(10)

    setGasPrice(gweiToHex(10))

    expect((Accounts.current().requests[1] as any).data.gasPrice).toBe(gweiToHex(10))
  })

  it('does not exceed the max gas price', () => {
    const maxTotal = 2e18 // 2 ETH
    const gasLimit = 1e7
    const maxTotalFee = maxTotal / gasLimit
    const highPrice = intToHex(maxTotalFee + 10e9) // 250 gwei

    request.data.gasLimit = intToHex(gasLimit)
    ;(maxFee as any).mockReturnValue(maxTotal)

    setGasPrice(highPrice)

    expect((Accounts.current().requests[1] as any).data.gasPrice).toBe(intToHex(maxTotalFee))
  })

  it('caps the gas price at 9999 gwei', () => {
    const maxPrice = gweiToHex(9999)
    const highPrice = gweiToHex(10200)

    setGasPrice(highPrice)

    expect((Accounts.current().requests[1] as any).data.gasPrice).toBe(maxPrice)
  })

  it('updates the feesUpdatedByUser flag', () => {
    request.data.gasPrice = gweiToHex(30)

    setGasPrice(gweiToHex(45), 1, true)

    expect((Accounts.current().requests[1] as any).feesUpdatedByUser).toBe(true)
  })
})

describe('#setGasLimit', () => {
  beforeEach(() => {
    Accounts.addRequest(request, jest.fn())
  })

  const setGasLimit = (limit: any, requestId = 1, userUpdate = false) =>
    Accounts.setGasLimit(limit, requestId, userUpdate)

  it('does not set an undefined gas limit', () => {
    expect(() => setGasLimit(undefined)).toThrow()
  })

  it('does not set an invalid gas limit', () => {
    expect(() => setGasLimit(Number.NaN)).toThrow()
  })

  it('does not set a negative gas limit', () => {
    expect(() => setGasLimit('-0x61a8')).toThrow()
  })

  it('does not set a gas limit if no account is active', () => {
    Accounts.setSigner(undefined, jest.fn())

    expect(() => setGasLimit('0x61a8')).toThrow(/no account selected/i)
  })

  it('fails to find the request', () => {
    expect(() => setGasLimit('0x61a8', 2)).toThrow(/could not find transaction/i)
  })

  it('does not set a gas limit on a non-transaction request', () => {
    request.type = 'message'

    expect(() => setGasLimit('0x61a8')).toThrow()
  })

  it('does not set a gas limit on a locked request', () => {
    request.locked = true

    expect(() => setGasLimit('0x61a8')).toThrow()
    expect((Accounts.current().requests[1] as any).data.gasLimit).toBe(request.data.gasLimit)
  })

  it('does not set a gas limit on an automatic update if fees were manually set by the user', () => {
    request.feesUpdatedByUser = true

    expect(() => setGasLimit('0x61a8')).toThrow()
    expect((Accounts.current().requests[1] as any).data.gasLimit).toBe(request.data.gasLimit)
  })

  it('sets a valid gas limit', () => {
    setGasLimit('0x61a8')

    expect((Accounts.current().requests[1] as any).data.gasLimit).toBe('0x61a8')
  })

  it('does not exceed the max fee for pre-EIP-1559 transactions', () => {
    const maxTotalFee = 2e18 // 2 ETH
    const gasPrice = 400e9 // 400 gwei
    const maxLimit = maxTotalFee / gasPrice
    const gasLimit = intToHex(maxLimit + 1e5) // add 10000 to exceed the maximum limit

    request.data.type = '0x0'
    request.data.gasPrice = intToHex(gasPrice)
    ;(maxFee as any).mockReturnValue(maxTotalFee)

    setGasLimit(gasLimit)

    expect((Accounts.current().requests[1] as any).data.gasLimit).toBe(intToHex(maxLimit))
  })

  it('does not exceed the max fee for post-EIP-1559 transactions', () => {
    const maxTotalFee = 2e18 // 2 ETH
    const maxFeePerGas = 400e9 // 400 gwei
    const maxLimit = maxTotalFee / maxFeePerGas
    const gasLimit = intToHex(maxLimit + 1e5) // add 10000 to exceed the maximum limit

    request.data.type = '0x2'
    request.data.maxFeePerGas = intToHex(maxFeePerGas)
    ;(maxFee as any).mockReturnValue(maxTotalFee)

    setGasLimit(gasLimit)

    expect((Accounts.current().requests[1] as any).data.gasLimit).toBe(intToHex(maxLimit))
  })

  it('caps the gas limit at 12.5e6', () => {
    const maxLimit = intToHex(12.5e6)
    const highLimit = intToHex(13e6)

    setGasLimit(highLimit)

    expect((Accounts.current().requests[1] as any).data.gasLimit).toBe(maxLimit)
  })

  it('updates the feesUpdatedByUser flag', () => {
    setGasLimit('0x61a8', 1, true)

    expect((Accounts.current().requests[1] as any).feesUpdatedByUser).toBe(true)
  })
})

describe('#adjustNonce', () => {
  let onChainNonce: any

  beforeEach(() => {
    provider.send = jest.fn((payload: any, cb: any) => {
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
    Accounts.addRequest(request, jest.fn())
  })

  const adjustNonce = (nonceAdjust: any, requestId = 1) => Accounts.adjustNonce(requestId, nonceAdjust)

  it('does not allow an invalid adjustment', () => {
    adjustNonce(2)

    expect((Accounts.current().requests[1] as any).data.nonce).toBe(request.data.nonce)
  })

  it('does not adjust a request if no account is active', () => {
    adjustNonce(1)

    expect((Accounts.current().requests[1] as any).data.nonce).toBe(request.data.nonce)
  })

  it('adjusts the provided nonce up one increment', () => {
    const expectedNonce = addHexPrefix((parseInt(request.data.nonce) + 1).toString(16))

    adjustNonce(1)

    expect((Accounts.current().requests[1] as any).data.nonce).toBe(expectedNonce)
  })

  it('adjusts the provided nonce down one increment', () => {
    const expectedNonce = addHexPrefix((parseInt(request.data.nonce) - 1).toString(16))

    adjustNonce(-1)

    expect((Accounts.current().requests[1] as any).data.nonce).toBe(expectedNonce)
  })

  it('gets the latest nonce from the chain', () => {
    onChainNonce = '0x5'

    delete request.data.nonce

    adjustNonce(1)

    expect((Accounts.current().requests[1] as any).data.nonce).toBe(onChainNonce)
  })

  it('gets the latest nonce from the chain and adjusts it down one increment', () => {
    onChainNonce = '0x5'
    const expectedNonce = addHexPrefix((parseInt(onChainNonce) - 1).toString(16))

    delete request.data.nonce

    adjustNonce(-1)

    expect((Accounts.current().requests[1] as any).data.nonce).toBe(expectedNonce)
  })
})

describe('#resetNonce', () => {
  beforeEach(() => {
    provider.send = jest.fn((payload: any, cb: any) => {
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
    Accounts.addRequest(request, jest.fn())
  })

  const resetNonce = (requestId = 1) => Accounts.resetNonce(requestId)

  it('it will un-set the nonce when not present inside the tx request payload', () => {
    delete request.payload.params[0].nonce
    resetNonce()
    expect(request.data.nonce).toBe(undefined)
  })

  it('it will revert to the nonce inside the tx request payload when present', () => {
    request.payload.params[0].nonce = '0x' + (BigInt(request.data.nonce) - 1n).toString(16)
    resetNonce()
    expect(request.data.nonce).toBe(request.payload.params[0].nonce)
  })
})

describe('#setTxSent', () => {
  it('confirms after the target confirmation count and removes after the close delay', async () => {
    const hash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef'
    const receiptBlock = 100
    const clearRequest = jest.spyOn(Accounts.current(), 'clearRequest')

    provider.send = jest.fn((payload: any, cb: any) => {
      if (payload.method === 'eth_subscribe') return cb({ error: { code: -32601, message: 'unsupported' } })
      if (payload.method === 'eth_blockNumber')
        return cb({ result: intToHex(receiptBlock + TRANSACTION_CONFIRMATION_TARGET) })
      if (payload.method === 'eth_getTransactionReceipt') {
        return cb({
          result: {
            status: '0x1',
            blockNumber: intToHex(receiptBlock),
            gasUsed: '0x5208'
          }
        })
      }

      cb({ result: null })
    })

    Accounts.addRequest(request, jest.fn())
    Accounts.setTxSent(request.handlerId, hash)
    jest.advanceTimersByTime(1000)
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect((Accounts.current().requests[request.handlerId] as any).status).toBe('confirmed')
    expect((Accounts.current().requests[request.handlerId] as any).tx.confirmations).toBe(
      TRANSACTION_CONFIRMATION_TARGET
    )

    jest.advanceTimersByTime(2999)
    expect(clearRequest).not.toHaveBeenCalledWith(request.handlerId)

    jest.advanceTimersByTime(1)
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

    provider.send = jest.fn((payload: any, cb: any) => {
      if (payload.method === 'eth_subscribe') return cb({ error: { code: -32601, message: 'unsupported' } })
      if (payload.method === 'eth_blockNumber')
        return cb({ result: intToHex(receiptBlock + TRANSACTION_CONFIRMATION_TARGET) })
      if (payload.method === 'eth_getTransactionReceipt') {
        return cb({
          result: {
            status: '0x1',
            blockNumber: intToHex(receiptBlock),
            gasUsed: '0x5208'
          }
        })
      }

      cb({ result: null })
    })

    Accounts.addRequest(request, jest.fn())
    Accounts.current().requests[otherChainRequest.handlerId] = otherChainRequest
    Accounts.setTxSent(request.handlerId, hash)
    jest.advanceTimersByTime(1000)
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

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

    provider.send = jest.fn()

    Accounts.addRequest(request, jest.fn())
    store.set('windows.panel.nav', [
      {
        view: 'requestView',
        data: {
          step: 'confirm',
          accountId: account.address,
          requestId: request.handlerId
        }
      }
    ])
    Accounts.addRequest(queuedRequest, jest.fn())

    Accounts.setTxSent(request.handlerId, hash)

    expect(store('windows.panel.nav', 0)).toEqual({
      view: 'requestView',
      data: {
        step: 'confirm',
        accountId: account.address,
        requestId: queuedRequest.handlerId
      }
    })
  })

  it('resumes non-terminal persisted activity after construction', async () => {
    const hash = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
    const receiptBlock = 200

    provider.send = jest.fn((payload: any, cb: any) => {
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

    store.set('main.activity', {
      [hash]: {
        id: hash,
        hash,
        account: account.address,
        address: account.address,
        chainId: 1,
        chainType: 'ethereum',
        nonce: request.data.nonce,
        status: 'submitted',
        confirmations: 0,
        submittedAt: Date.now(),
        updatedAt: Date.now(),
        data: {
          ...request.data,
          from: account.address,
          chainId: '0x1'
        }
      }
    })

    new AccountsClass()
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(store('main.activity', hash)).toEqual(
      expect.objectContaining({
        status: 'succeeded',
        confirmations: TRANSACTION_CONFIRMATION_TARGET
      })
    )
  })
})

describe('#resolveRequest', () => {
  it('does nothing with an unknown request', () => {
    Accounts.addRequest(request, () => {
      throw new Error('unexpected callback!')
    })

    Accounts.resolveRequest({ payload: {}, handlerId: '-1' })

    expect(Object.keys(Accounts.current().requests)).toHaveLength(1)
  })

  it('resolves a request with a callback', (done) => {
    Accounts.addRequest(request, () => done())

    Accounts.resolveRequest(request)

    try {
      expect(Object.keys(Accounts.current().requests)).toHaveLength(0)
    } catch (e) {
      done(e)
    }
  })

  it('resolves a request with no callback', () => {
    Accounts.addRequest(request)

    Accounts.resolveRequest(request)

    expect(Object.keys(Accounts.current().requests)).toHaveLength(0)
  })
})

describe('#removeRequest', () => {
  beforeEach(() => {
    ;(account as any).clearRequest = jest.fn()
    Accounts.addRequest(request)
  })

  it('should remove a request for the provided handlerId from the account', () => {
    Accounts.removeRequest(account, request.handlerId)

    expect((account as any).clearRequest).toHaveBeenCalledWith(request.handlerId)
  })
})

describe('#clearRequestsByOrigin', () => {
  beforeEach(() => {
    Accounts.addRequest(request)
    Accounts.addRequest({ ...request, handlerId: '2' })
    Accounts.addRequest({ ...request, handlerId: '3', origin: '07h3r' })
  })

  it('should remove any request from a given origin', () => {
    Accounts.clearRequestsByOrigin(account.id, request.origin)
    expect(Object.keys(Accounts.accounts[account.id].requests)).toHaveLength(1)
  })
})

describe('#signerCompatibility', () => {
  let activeSigner: any

  const lockedSeedSigner = {
    id: '13',
    type: 'seed',
    addresses: [account.id],
    status: 'locked'
  }

  beforeEach(() => {
    store.navDash = jest.fn()

    activeSigner = {
      id: '12',
      type: 'seed',
      addresses: [account.id],
      summary: jest.fn()
    }

    store.newSigner(lockedSeedSigner)
    ;(signers.get as any).mockImplementation((id: any) => {
      if (id === activeSigner.id) return activeSigner
      if (id === lockedSeedSigner.id) return lockedSeedSigner
    })

    Accounts.accounts[account.id].lastSignerType = 'seed'
    Accounts.accounts[account.id].signer = activeSigner.id
    Accounts.addRequest(request)
  })

  afterEach(() => {
    store.removeSigner(activeSigner.id)
    store.removeSigner(lockedSeedSigner.id)

    Accounts.removeRequests([request.handlerId])
  })

  const signerTypes = ['trezor', 'ledger', 'lattice']

  signerTypes.forEach((signerType) => {
    it(`should open the signer menu when a ${signerType} signer is not available`, () => {
      const cb = jest.fn()

      activeSigner.status = 'disconnected'
      activeSigner.type = signerType
      store.newSigner(activeSigner)

      Accounts.accounts[account.id].signer = undefined
      Accounts.accounts[account.id].lastSignerType = signerType

      Accounts.signerCompatibility(request.handlerId, cb)

      expect(cb).toHaveBeenCalledWith(new Error('Signer unavailable'))
      expect(store.navDash).toHaveBeenCalledWith({
        data: {
          signer: activeSigner.id
        },
        view: 'expandedSigner'
      })
    })
  })

  it('should not open the signer menu if the current signer is ready', () => {
    const cb = jest.fn()
    const compatibility = { signer: activeSigner.id, tx: 'sometx', compatible: true }

    activeSigner.status = 'ok'
    ;(signerCompatibility as any).mockReturnValue(compatibility)

    Accounts.signerCompatibility(request.handlerId, cb)

    expect(store.navDash).not.toHaveBeenCalled()
    expect(cb).toHaveBeenCalledWith(null, compatibility)
  })

  it('should not open the signer panel for a hot signer that is not ready', () => {
    const cb = jest.fn()

    activeSigner.status = 'locked'

    Accounts.signerCompatibility(request.handlerId, cb)

    expect(store.navDash).not.toHaveBeenCalled()
  })

  it('should return an app lock error when a hot signer is not ready', () => {
    const cb = jest.fn()

    activeSigner.status = 'locked'

    Accounts.signerCompatibility(request.handlerId, cb)

    expect(cb).toHaveBeenCalledWith(new Error('Newframe locked'))
  })

  it('should return an error when there is no signer', () => {
    const cb = jest.fn()

    Accounts.accounts[account.id].signer = undefined

    Accounts.signerCompatibility(request.handlerId, cb)

    expect(store.navDash).not.toHaveBeenCalled()
    expect(cb).toHaveBeenCalledWith(new Error('No signer'))
  })
})
