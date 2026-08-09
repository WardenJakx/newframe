import { afterEach, beforeAll, beforeEach, describe, expect, it, jest as timers, mock } from 'bun:test'

import store from '../../../../platform/state-store'
import createCanonicalStore from '../../../../platform/state-store/createCanonicalStore'

const mockBalancesFactory = mock(() => mockBalances)

mock.module('./balances', () => ({ default: mockBalancesFactory }))

let dataManager: any, externalData: any, mockBalances: any

beforeAll(async () => {
  externalData = (await import('./index')).default
})

beforeEach(() => {
  timers.useFakeTimers()
  store.setState((state) => {
    state.tray.open = true
  })

  mockBalances = {
    addNetworks: mock(),
    addTokens: mock(),
    start: mock(),
    stop: mock(),
    pause: mock(),
    resume: mock(),
    refresh: mock(),
    refreshPositions: mock(),
    setAddress: mock()
  }
  dataManager = externalData(store)
})

afterEach(() => {
  dataManager.close()
  timers.useRealTimers()
})

describe('address updates', () => {
  const address = '0x0000000000000000000000000000000000001234'

  it('runs a targeted one-shot refresh when selecting a watch account', () => {
    store.setState((state) => {
      state.main.accounts[address] = { address, lastSignerType: 'Address' } as any
      state.main.currentAccount = address
    })

    timers.advanceTimersByTime(800)

    expect(mockBalances.setAddress).toHaveBeenCalledWith('')
    expect(mockBalances.refresh).toHaveBeenCalledWith(address)
  })

  it('allows a manual on-chain refresh for a watch account', () => {
    store.setState((state) => {
      state.main.accounts[address] = { address, lastSignerType: 'Address' } as any
    })

    dataManager.refreshBalances(address)

    expect(mockBalances.refresh).toHaveBeenCalledWith(address)
  })
})

it('keeps refresh state and lifecycle isolated across two production scanner instances', () => {
  const memoryStorage = {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined
  }
  const firstStore = createCanonicalStore(memoryStorage).store
  const secondStore = createCanonicalStore(memoryStorage).store
  const scannerBalances = () => ({
    addNetworks: mock(),
    addTokens: mock(),
    start: mock(() => true),
    stop: mock(),
    pause: mock(),
    resume: mock(),
    refresh: mock(),
    refreshPositions: mock(),
    setAddress: mock()
  })
  const firstBalances = scannerBalances()
  const secondBalances = scannerBalances()
  mockBalancesFactory.mockImplementationOnce(() => firstBalances)
  mockBalancesFactory.mockImplementationOnce(() => secondBalances)
  const firstScanner = externalData(firstStore)
  const secondScanner = externalData(secondStore)
  const firstAddress = '0x0000000000000000000000000000000000001111'
  const secondAddress = '0x0000000000000000000000000000000000002222'

  firstStore.getState().upsertAccount({
    id: firstAddress,
    address: firstAddress,
    name: 'First',
    lastSignerType: 'Address',
    signer: '',
    signerStatus: '',
    agentEnabled: false
  })
  secondStore.getState().upsertAccount({
    id: secondAddress,
    address: secondAddress,
    name: 'Second',
    lastSignerType: 'Address',
    signer: '',
    signerStatus: '',
    agentEnabled: false
  })
  firstStore.getState().setAccount({ id: firstAddress })
  secondStore.getState().setAccount({ id: secondAddress })
  timers.advanceTimersByTime(800)
  firstScanner.close()

  expect({
    first: firstBalances.refresh.mock.calls,
    second: secondBalances.refresh.mock.calls,
    firstStopped: firstBalances.stop.mock.calls.length,
    secondStopped: secondBalances.stop.mock.calls.length
  }).toEqual({
    first: [[firstAddress]],
    second: [[secondAddress]],
    firstStopped: 1,
    secondStopped: 0
  })

  secondScanner.close()
})

it('cancels pending store-driven scans when closed', () => {
  const address = '0x0000000000000000000000000000000000003333'
  mockBalances.addNetworks.mockClear()
  mockBalances.addTokens.mockClear()
  mockBalances.refresh.mockClear()
  mockBalances.setAddress.mockClear()

  store.setState((state) => {
    state.main.accounts[address] = { address, lastSignerType: 'ledger' } as any
    state.main.currentAccount = address
    const network = Object.values(state.main.networks.ethereum)[0]
    if (network) network.connection.primary.connected = true
    state.main.tokens = { ...state.main.tokens }
  })

  dataManager.close()
  timers.advanceTimersByTime(1_000)

  expect({
    addNetworks: mockBalances.addNetworks.mock.calls,
    addTokens: mockBalances.addTokens.mock.calls,
    refresh: mockBalances.refresh.mock.calls,
    setAddress: mockBalances.setAddress.mock.calls,
    stopped: mockBalances.stop.mock.calls.length
  }).toEqual({
    addNetworks: [],
    addTokens: [],
    refresh: [],
    setAddress: [],
    stopped: 1
  })
})

describe('hiding and showing the tray', () => {
  it('pauses the balances scanner if the tray is hidden for 1 minute', () => {
    setTrayShown(false)

    expect(mockBalances.pause).toHaveBeenCalled()
  })

  it('does not pause the balances scanner if the tray was already hidden', () => {
    setTrayShown(false)
    setTrayShown(false)

    expect(mockBalances.pause).toHaveBeenCalledTimes(1)
  })

  it('does not attempt to resume the balances scanner the first time the tray is shown', () => {
    setTrayShown(true)

    expect(mockBalances.resume).not.toHaveBeenCalled()
  })

  it('resumes the balances scanner when the tray is shown after previously being hidden', () => {
    setTrayShown(false)
    setTrayShown(true)

    expect(mockBalances.resume).toHaveBeenCalled()
  })
})

function setTrayShown(shown: any) {
  store.setState((state) => {
    state.tray.open = shown
  })

  timers.advanceTimersByTime(1000 * 60)
}
