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

function token(index: number, chainId = 10) {
  return {
    chainId,
    address: `0x${index.toString(16).padStart(40, '0')}`,
    symbol: `T${index}`
  }
}

let balances: any

beforeAll(() => {
  log.transports.console.level = false
})

beforeEach(() => {
  store.set('main.tokens.custom', [])
  store.set('main.tokens.known', address, knownTokens)
  store.set('main.networks.ethereum.10', {
    id: 10,
    name: 'Optimism',
    on: true,
    connection: { primary: { connected: true } }
  })
  store.set('main.networksMeta.ethereum.10', {
    nativeCurrency: { symbol: 'ETH', decimals: 18 }
  })
  store.set('main.balances', address, [
    {
      ...knownTokens[0],
      balance: '0xde0b6b3a7640000',
      decimals: 18,
      displayBalance: '1',
      name: 'Optimism'
    }
  ])
  store.set('main.rates', knownTokens[0].address, {
    usd: { price: 2, change24hr: 0 }
  })

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

it('only manually refreshes non-dust valued tokens and curated blue chips', () => {
  const valuable = { ...token(1), name: 'Valuable', decimals: 18 }
  const dust = { ...token(2), name: 'Dust', decimals: 18 }
  const noPrice = { ...token(3), name: 'No Price', decimals: 18 }
  const weth = {
    ...token(4),
    name: 'Wrapped Ether',
    symbol: 'WETH',
    decimals: 18
  }
  const usdc = { ...token(5), name: 'USD Coin', symbol: 'USDC', decimals: 6 }
  const custom = { ...token(6), name: 'Custom', decimals: 18 }
  const tokens = [valuable, dust, noPrice, weth, usdc]
  const oneToken = '0xde0b6b3a7640000'

  store.set('main.tokens.known', address, tokens)
  store.set('main.tokens.custom', [custom])
  store.set(
    'main.balances',
    address,
    [...tokens, custom].map((trackedToken) => ({
      ...trackedToken,
      balance: [weth, usdc].includes(trackedToken) ? '0x0' : oneToken,
      displayBalance: [weth, usdc].includes(trackedToken) ? '0' : '1'
    }))
  )
  store.set('main.rates', valuable.address, { usd: { price: 2, change24hr: 0 } })
  store.set('main.rates', dust.address, { usd: { price: 0.001, change24hr: 0 } })
  ;(balancesController as any).isRunning.mockReturnValue(true)

  balances.refresh(address)

  expect((balancesController as any).updateKnownTokenBalances).toHaveBeenCalledWith(address, [
    custom,
    valuable,
    weth,
    usdc
  ])
  expect((balancesController as any).updateChainBalances).toHaveBeenCalledWith(address, [10])
})

it('manually refreshes every custom token without applying the discovery scan cap', () => {
  const customTokens = Array.from({ length: 300 }, (_, i) => ({
    ...token(i + 1),
    name: `Custom ${i + 1}`,
    decimals: 18
  }))

  store.set('main.tokens.custom', customTokens)
  store.set('main.tokens.known', address, [])
  store.set('main.balances', address, [])
  ;(balancesController as any).isRunning.mockReturnValue(true)

  balances.refresh(address)

  expect((balancesController as any).updateKnownTokenBalances).toHaveBeenCalledWith(address, customTokens)
})

it('refreshes affected tokens and the native balance for a transaction chain', () => {
  const affectedTokens = [token(1, 10), token(2, 1)]
  ;(balancesController as any).isRunning.mockReturnValue(true)

  balances.refreshPositions(address, 10, affectedTokens)

  expect((balancesController as any).updateKnownTokenBalances).toHaveBeenCalledWith(address, [
    affectedTokens[0]
  ])
  expect((balancesController as any).updateChainBalances).toHaveBeenCalledWith(address, [10])
})

it('caps large known token scans while preserving custom tokens', () => {
  const customTokens = [token(1000), token(1001)]
  const discoveredTokens = Array.from({ length: 300 }, (_, i) => token(i + 1))

  store.set('main.tokens.custom', customTokens)
  store.set('main.tokens.known', address, discoveredTokens)
  ;(balancesController as any).isRunning.mockReturnValue(true)

  balances.setAddress(address)
  jest.advanceTimersByTime(0)

  expect((balancesController as any).updateKnownTokenBalances).toHaveBeenCalledWith(
    address,
    expect.arrayContaining(customTokens)
  )

  const scannedTokens = (balancesController as any).updateKnownTokenBalances.mock.calls[0][1]
  expect(scannedTokens).toHaveLength(250)
  expect(scannedTokens.slice(0, customTokens.length)).toEqual(customTokens)
})

it('caps direct token update scans', () => {
  const discoveredTokens = Array.from({ length: 300 }, (_, i) => token(i + 1))
  ;(balancesController as any).isRunning.mockReturnValue(true)

  balances.addTokens(address, discoveredTokens)

  const scannedTokens = (balancesController as any).updateKnownTokenBalances.mock.calls[0][1]
  expect(scannedTokens).toHaveLength(250)
  expect(scannedTokens).toEqual(discoveredTokens.slice(0, 250))
})
