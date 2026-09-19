import { afterEach, beforeAll, beforeEach, expect, it, jest as timers, mock } from 'bun:test'
import { EventEmitter } from 'events'

import log from 'electron-log'

import store from '../../../../../platform/state-store'
import { NATIVE_CURRENCY } from '../../../../tokens/domain/constants'
import type { TokenRecord } from '../../../../tokens/domain/state/token'
import BalancesScanner from './index'

const controllerEvents = new EventEmitter()
const balancesControllerMock = {
  close: mock(),
  emit: controllerEvents.emit.bind(controllerEvents),
  isRunning: mock(),
  off: controllerEvents.off.bind(controllerEvents),
  on: controllerEvents.on.bind(controllerEvents),
  once: controllerEvents.once.bind(controllerEvents),
  updateChainBalances: mock(),
  updateKnownTokenBalances: mock((_address: string, _tokens: Array<ReturnType<typeof token>>) => {})
}

await mock.module('./controller', () => ({
  __esModule: true,
  default: mock(() => balancesControllerMock),
  ...balancesControllerMock
}))

const balancesController = balancesControllerMock

const address = '0x95222290DD7278Aa3Ddd389Cc1E1d165CC4BAfe5'

const knownTokens = [
  {
    chainId: 10,
    address: '0x4200000000000000000000000000000000000042',
    decimals: 18,
    name: 'Optimism',
    symbol: 'OP'
  }
]

function token(index: number, chainId = 10) {
  return {
    chainId,
    address: `0x${index.toString(16).padStart(40, '0')}`,
    decimals: 18,
    name: `Token ${index}`,
    symbol: `T${index}`
  }
}

function storedToken(input: ReturnType<typeof token>, custom = false): TokenRecord {
  return {
    ...input,
    custom,
    curated: false,
    sources: [custom ? 'custom' : 'onchain'],
    updatedAt: 0
  }
}

type TestMainState = {
  accounts: Record<string, { address: string; id: string; requests: Record<string, unknown> }>
  assetRates: Record<string, { observedAt: number; source: string; usdRate: number }>
  balances: Record<string, Array<Record<string, unknown>>>
  networks: { ethereum: Record<number, Record<string, unknown>> }
  networksMeta: { ethereum: Record<number, Record<string, unknown>> }
  tokens: ReturnType<typeof catalogFor>
}

function catalogFor(known: Array<ReturnType<typeof token>>, custom: Array<ReturnType<typeof token>> = []) {
  const records = [
    ...known.map((item) => storedToken(item)),
    ...custom.map((item) => storedToken(item, true))
  ]
  return {
    byId: Object.fromEntries(records.map((item) => [`${item.chainId}:${item.address.toLowerCase()}`, item])),
    accountTokenIds: {
      [address.toLowerCase()]: known.map((item) => `${item.chainId}:${item.address.toLowerCase()}`)
    }
  }
}

let balances: ReturnType<typeof BalancesScanner>

beforeAll(() => {
  log.transports.console.level = false
})

beforeEach(() => {
  timers.useFakeTimers()
  controllerEvents.removeAllListeners()
  store.setState((state) => {
    const main = state.main as unknown as TestMainState
    main.tokens = catalogFor(knownTokens)
    main.networks.ethereum[10] = {
      id: 10,
      name: 'Optimism',
      on: true,
      connection: { primary: { connected: true } }
    }
    main.networksMeta.ethereum[10] = {
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }
    }
    main.balances[address] = [
      {
        ...knownTokens[0],
        balance: '0xde0b6b3a7640000',
        decimals: 18,
        displayBalance: '1',
        name: 'Optimism'
      }
    ]
    main.assetRates[`10:${knownTokens[0].address}`] = {
      usdRate: 2,
      source: 'zerion',
      observedAt: 1
    }
  })

  balances = BalancesScanner(store)
  balances.start()
})

afterEach(() => {
  balances.stop()
  timers.useRealTimers()
})

it('scans for balances when setting an address if the controller is ready', () => {
  balancesController.isRunning.mockReturnValue(true)
  balances.setAddress(address)

  timers.advanceTimersByTime(0)

  expect(balancesController.updateKnownTokenBalances).toHaveBeenCalled()
})

it('scans for balances as soon as the controller is ready', () => {
  balancesController.isRunning.mockReturnValue(false)
  balances.setAddress(address)

  expect(balancesController.updateKnownTokenBalances).not.toHaveBeenCalled()
  balancesController.emit('ready')
  timers.advanceTimersByTime(0)

  expect(balancesController.updateKnownTokenBalances).toHaveBeenCalled()
})

it('cancels a queued ready scan when stopped', () => {
  balancesController.isRunning.mockReturnValue(false)
  balances.setAddress(address)

  balances.stop()
  balancesController.emit('ready')
  timers.advanceTimersByTime(5 * 60 * 1000)

  expect(balancesController.updateKnownTokenBalances.mock.calls).toHaveLength(0)
  expect(balancesController.updateChainBalances.mock.calls).toHaveLength(0)
})

it('cancels an already queued initial scan when stopped', () => {
  balancesController.isRunning.mockReturnValue(true)
  balances.setAddress(address)

  balances.stop()
  timers.advanceTimersByTime(5 * 60 * 1000)

  expect(balancesController.updateKnownTokenBalances.mock.calls).toHaveLength(0)
  expect(balancesController.updateChainBalances.mock.calls).toHaveLength(0)
})

it('scans for balances every 10 minutes when paused', () => {
  balancesController.isRunning.mockReturnValue(true)
  balances.setAddress(address)

  balances.pause()

  timers.advanceTimersByTime(10 * 60 * 1000)

  expect(balancesController.updateKnownTokenBalances).toHaveBeenCalledTimes(1)
})

it('refreshes balances on demand', () => {
  balancesController.isRunning.mockReturnValue(true)

  balances.refresh(address)
  timers.advanceTimersByTime(0)

  expect(balancesController.updateKnownTokenBalances).toHaveBeenCalledWith(address, knownTokens)
  expect(balancesController.updateChainBalances).toHaveBeenCalledWith(address, [10])
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

  store.setState((state) => {
    const main = state.main as unknown as TestMainState
    main.tokens = catalogFor(tokens, [custom])
    main.balances[address] = [...tokens, custom].map((trackedToken) => ({
      ...trackedToken,
      balance: [weth, usdc].includes(trackedToken) ? '0x0' : oneToken,
      displayBalance: [weth, usdc].includes(trackedToken) ? '0' : '1'
    }))
    main.assetRates[`10:${valuable.address}`] = {
      usdRate: 2,
      source: 'zerion',
      observedAt: 1
    }
    main.assetRates[`10:${dust.address}`] = {
      usdRate: 0.001,
      source: 'zerion',
      observedAt: 1
    }
  })
  balancesController.isRunning.mockReturnValue(true)

  balances.refresh(address)

  expect(balancesController.updateKnownTokenBalances).toHaveBeenCalledWith(address, [
    custom,
    valuable,
    weth,
    usdc
  ])
  expect(balancesController.updateChainBalances).toHaveBeenCalledWith(address, [10])
})

it('manually refreshes every custom token without applying the discovery scan cap', () => {
  const customTokens = Array.from({ length: 300 }, (_, i) => ({
    ...token(i + 1),
    name: `Custom ${i + 1}`,
    decimals: 18
  }))

  store.setState((state) => {
    state.main.tokens = catalogFor([], customTokens)
    state.main.balances[address] = []
  })
  balancesController.isRunning.mockReturnValue(true)

  balances.refresh(address)

  expect(balancesController.updateKnownTokenBalances).toHaveBeenCalledWith(address, customTokens)
})

it('refreshes affected tokens and the native balance immediately and again after five seconds', () => {
  const affectedTokens = [token(1, 10), token(2, 1)]
  balancesController.isRunning.mockReturnValue(true)

  balances.refreshPositions(address, 10, affectedTokens)

  expect(balancesController.updateKnownTokenBalances).toHaveBeenCalledWith(address, [affectedTokens[0]])
  expect(balancesController.updateChainBalances).toHaveBeenCalledWith(address, [10])

  timers.advanceTimersByTime(4999)

  expect(balancesController.updateKnownTokenBalances).toHaveBeenCalledTimes(1)
  expect(balancesController.updateChainBalances).toHaveBeenCalledTimes(1)

  timers.advanceTimersByTime(1)

  expect(balancesController.updateKnownTokenBalances).toHaveBeenCalledTimes(2)
  expect(balancesController.updateKnownTokenBalances).toHaveBeenLastCalledWith(address, [affectedTokens[0]])
  expect(balancesController.updateChainBalances).toHaveBeenCalledTimes(2)
  expect(balancesController.updateChainBalances).toHaveBeenLastCalledWith(address, [10])
})

it('cancels delayed position refreshes when the balance scanner stops', () => {
  balancesController.isRunning.mockReturnValue(true)

  balances.refreshPositions(address, 10, [token(1, 10)])
  balances.stop()
  timers.advanceTimersByTime(5 * 1000)

  expect(balancesController.updateKnownTokenBalances).toHaveBeenCalledTimes(1)
  expect(balancesController.updateChainBalances).toHaveBeenCalledTimes(1)
})

it('caps large known token scans while preserving custom tokens', () => {
  const customTokens = [token(1000), token(1001)]
  const discoveredTokens = Array.from({ length: 300 }, (_, i) => token(i + 1))

  store.setState((state) => {
    state.main.tokens = catalogFor(discoveredTokens, customTokens)
  })
  balancesController.isRunning.mockReturnValue(true)

  balances.setAddress(address)
  timers.advanceTimersByTime(0)

  expect(balancesController.updateKnownTokenBalances).toHaveBeenCalledWith(
    address,
    expect.arrayContaining(customTokens)
  )

  const scannedTokens = balancesController.updateKnownTokenBalances.mock.calls[0][1]
  expect(scannedTokens).toHaveLength(250)
  expect(scannedTokens.slice(0, customTokens.length)).toEqual(customTokens)
})

it('caps direct token update scans', () => {
  const discoveredTokens = Array.from({ length: 300 }, (_, i) => token(i + 1))
  balancesController.isRunning.mockReturnValue(true)

  balances.addTokens(address, discoveredTokens)

  const scannedTokens = balancesController.updateKnownTokenBalances.mock.calls[0][1]
  expect(scannedTokens).toHaveLength(250)
  expect(scannedTokens).toEqual(discoveredTokens.slice(0, 250))
})

it('stores native worker balances without duplicating currency metadata', () => {
  store.setState((state) => {
    const main = state.main as unknown as TestMainState
    main.accounts[address] = { id: address, address, requests: {} }
  })

  balancesController.emit('chainBalances', address, [{ chainId: 10, balance: '0x2', displayBalance: '2' }])

  expect(store.getState().main.balances[address]).toContainEqual({
    address: NATIVE_CURRENCY,
    balance: '0x2',
    chainId: 10,
    displayBalance: '2'
  })
})

it('ignores a late worker update after its network has been removed', () => {
  store.setState((state) => {
    const main = state.main as unknown as TestMainState
    main.accounts[address] = { id: address, address, requests: {} }
    delete main.networks.ethereum[10]
    delete main.networksMeta.ethereum[10]
  })

  expect(() => {
    balancesController.emit('chainBalances', address, [
      { chainId: 10, balance: '0x1', decimals: 18, name: 'Ether' }
    ])
    balancesController.emit('tokenBalances', address, [
      { ...knownTokens[0], balance: '0x1', decimals: 18, name: 'Optimism' }
    ])
  }).not.toThrow()

  expect(store.getState().main.balances[address]).toHaveLength(1)
})
