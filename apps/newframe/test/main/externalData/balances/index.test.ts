import BalancesScanner from '../../../../main/externalData/balances'
import store from '../../../../main/store'
import log from 'electron-log'
import { EventEmitter } from 'events'

const controllerEvents = new EventEmitter()
const balancesControllerMock = {
  close: jest.fn(),
  emit: controllerEvents.emit.bind(controllerEvents),
  isRunning: jest.fn(),
  off: controllerEvents.off.bind(controllerEvents),
  on: controllerEvents.on.bind(controllerEvents),
  once: controllerEvents.once.bind(controllerEvents),
  updateChainBalances: jest.fn(),
  updateKnownTokenBalances: jest.fn()
}

jest.mock('../../../../main/externalData/balances/controller', () => ({
  __esModule: true,
  default: jest.fn(() => balancesControllerMock),
  ...balancesControllerMock
}))

const balancesController = balancesControllerMock as any

const address = '0x95222290DD7278Aa3Ddd389Cc1E1d165CC4BAfe5'

const knownTokens = [
  {
    chainId: 10,
    address: '0x4200000000000000000000000000000000000042',
    symbol: 'OP'
  }
]

let balances: any

beforeAll(() => {
  log.transports.console.level = false
})

beforeEach(() => {
  store.set('main.tokens.known', address, knownTokens)
  store.set('main.networks.ethereum.10', { id: 10, connection: { primary: { connected: true } } })

  balances = BalancesScanner(store)
  balances.start()
})

afterEach(() => {
  balances.stop()
})

it('scans for balances when setting an address if the controller is ready', () => {
  ;(balancesController as any).isRunning.mockReturnValue(true)
  balances.setAddress(address)

  jest.advanceTimersByTime(0)

  expect((balancesController as any).updateKnownTokenBalances).toHaveBeenCalled()
})

it('scans for balances as soon as the controller is ready', () => {
  ;(balancesController as any).isRunning.mockReturnValue(false)
  balances.setAddress(address)

  expect((balancesController as any).updateKnownTokenBalances).not.toHaveBeenCalled()
  ;(balancesController as any).emit('ready')
  jest.advanceTimersByTime(0)

  expect((balancesController as any).updateKnownTokenBalances).toHaveBeenCalled()
})

it('scans for balances every 10 minutes when paused', () => {
  ;(balancesController as any).isRunning.mockReturnValue(true)
  balances.setAddress(address)

  balances.pause()

  jest.advanceTimersByTime(10 * 60 * 1000)

  expect((balancesController as any).updateKnownTokenBalances).toHaveBeenCalledTimes(1)
})

it('refreshes balances on demand', () => {
  ;(balancesController as any).isRunning.mockReturnValue(true)

  balances.refresh(address)
  jest.advanceTimersByTime(0)

  expect((balancesController as any).updateKnownTokenBalances).toHaveBeenCalledWith(address, knownTokens)
  expect((balancesController as any).updateChainBalances).toHaveBeenCalledWith(address, [10])
})
