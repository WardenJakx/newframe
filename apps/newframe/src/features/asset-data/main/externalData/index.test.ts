import { afterEach, beforeAll, beforeEach, describe, expect, it, jest as timers, mock } from 'bun:test'

import { DEFAULT_PROFILE_ID } from '../../../../app/contracts/state/main.ts'
import { createOutbound } from '../../../../platform/outbound/index.ts'
import createCanonicalStore from '../../../../platform/state-store/createCanonicalStore.ts'
import store from '../../../../platform/state-store/index.ts'
import type { Account } from '../../../accounts/domain/state/account.ts'

const mockBalancesFactory = mock(() => mockBalances)

await mock.module('./balances/index.ts', () => ({ default: mockBalancesFactory }))

let dataManager: ReturnType<typeof externalData>
let externalData: typeof import('./index.ts').default
let mockBalances: ReturnType<typeof createBalancesMock>

beforeAll(async () => {
  externalData = (await import('./index.ts')).default
})

beforeEach(() => {
  timers.useFakeTimers()
  store.setState((state) => {
    state.tray.open = true
    state.main.accounts = {}
    state.main.currentAccount = ''
  })

  mockBalances = {
    addNetworks: mock(),
    addTokens: mock(),
    start: mock(() => true),
    stop: mock(),
    pause: mock(),
    resume: mock(),
    refresh: mock(),
    refreshPositions: mock(),
    setAddress: mock()
  }
  dataManager = externalData(store, outbound())
})

afterEach(() => {
  dataManager.close()
  timers.useRealTimers()
})

function createBalancesMock(start = mock(() => true)) {
  return {
    addNetworks: mock(),
    addTokens: mock(),
    start,
    stop: mock(),
    pause: mock(),
    resume: mock(),
    refresh: mock(),
    refreshPositions: mock(),
    setAddress: mock()
  }
}

function accountState(address: string, lastSignerType: string): Account {
  return {
    id: address,
    profileId: DEFAULT_PROFILE_ID,
    address,
    name: 'Test',
    lastSignerType,
    status: '',
    signer: '',
    signerStatus: '',
    agentEnabled: false,
    requests: {},
    created: ''
  }
}

function outbound(open = true) {
  const gate = createOutbound(fetch)
  gate.setOpen(open)
  return gate
}

function isolatedStore(address?: string, signerType = 'ledger') {
  const memoryStorage = {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined
  }
  const isolated = createCanonicalStore(memoryStorage).store
  if (address) {
    isolated.getState().upsertAccount({
      id: address,
      address,
      name: 'Test',
      lastSignerType: signerType,
      signer: '',
      signerStatus: '',
      agentEnabled: false
    })
    isolated.getState().setAccount({ id: address })
  }
  return isolated
}

describe('outbound lifecycle', () => {
  const normalAddress = '0x0000000000000000000000000000000000004444'
  const watchAddress = '0x0000000000000000000000000000000000005555'

  it('does not start while outbound traffic is closed', () => {
    const balances = createBalancesMock()
    mockBalancesFactory.mockImplementationOnce(() => balances)

    const scanner = externalData(isolatedStore(), outbound(false))

    expect(balances.start.mock.calls).toHaveLength(0)

    scanner.close()
  })

  it('starts once outbound traffic opens and immediately scans normal and watch accounts appropriately', () => {
    const normalBalances = createBalancesMock()
    const watchBalances = createBalancesMock()
    const normalOutbound = outbound(false)
    const watchOutbound = outbound(false)
    mockBalancesFactory.mockImplementationOnce(() => normalBalances)
    mockBalancesFactory.mockImplementationOnce(() => watchBalances)
    const normalScanner = externalData(isolatedStore(normalAddress), normalOutbound)
    const watchScanner = externalData(isolatedStore(watchAddress, 'Address'), watchOutbound)

    normalOutbound.setOpen(true)
    watchOutbound.setOpen(true)

    expect(normalBalances.start.mock.calls).toHaveLength(1)
    expect(normalBalances.setAddress.mock.calls).toEqual([[normalAddress]])
    expect(normalBalances.refresh.mock.calls).toHaveLength(0)
    expect(watchBalances.start.mock.calls).toHaveLength(1)
    expect(watchBalances.setAddress.mock.calls).toEqual([['']])
    expect(watchBalances.refresh.mock.calls).toEqual([[watchAddress]])

    normalScanner.close()
    watchScanner.close()
  })

  it('stops when outbound traffic closes and ignores repeated equivalent transitions', () => {
    const balances = createBalancesMock()
    const gate = outbound(false)
    mockBalancesFactory.mockImplementationOnce(() => balances)
    const scanner = externalData(isolatedStore(normalAddress), gate)

    gate.setOpen(true)
    gate.setOpen(true)
    gate.setOpen(false)
    gate.setOpen(false)

    expect(balances.start.mock.calls).toHaveLength(1)
    expect(balances.stop.mock.calls).toHaveLength(1)

    scanner.close()
  })

  it('ignores manual refresh while outbound traffic is closed', () => {
    const balances = createBalancesMock()
    mockBalancesFactory.mockImplementationOnce(() => balances)
    const scanner = externalData(isolatedStore(normalAddress), outbound(false))

    scanner.refreshBalances(normalAddress)
    scanner.refreshPositions(normalAddress, 1, [])

    expect(balances.start.mock.calls).toHaveLength(0)
    expect(balances.refresh.mock.calls).toHaveLength(0)
    expect(balances.refreshPositions.mock.calls).toHaveLength(0)

    scanner.close()
  })

  it('lazily starts a missing active service before a manual refresh', () => {
    let startCount = 0
    const start = mock(() => ++startCount > 1)
    const balances = createBalancesMock(start)
    mockBalancesFactory.mockImplementationOnce(() => balances)
    const scanner = externalData(isolatedStore(normalAddress), outbound())

    scanner.refreshBalances(normalAddress)

    expect(start.mock.calls).toHaveLength(2)
    expect(balances.setAddress.mock.calls).toEqual([[normalAddress]])
    expect(balances.refresh.mock.calls).toEqual([[normalAddress]])

    scanner.close()
  })

  it('lazily starts a missing active service before a position refresh', () => {
    let startCount = 0
    const start = mock(() => ++startCount > 1)
    const balances = createBalancesMock(start)
    mockBalancesFactory.mockImplementationOnce(() => balances)
    const scanner = externalData(isolatedStore(normalAddress), outbound())

    scanner.refreshPositions(normalAddress, 1, [])

    expect(start.mock.calls).toHaveLength(2)
    expect(balances.setAddress.mock.calls).toEqual([[normalAddress]])
    expect(balances.refreshPositions.mock.calls).toEqual([[normalAddress, 1, []]])

    scanner.close()
  })

  it('does not replay pending store refreshes after outbound traffic closes and reopens', () => {
    const balances = createBalancesMock()
    const scannerStore = isolatedStore()
    const gate = outbound()
    mockBalancesFactory.mockImplementationOnce(() => balances)
    const scanner = externalData(scannerStore, gate)
    balances.addNetworks.mockClear()
    balances.addTokens.mockClear()
    balances.refresh.mockClear()
    balances.setAddress.mockClear()

    scannerStore.setState((state) => {
      state.main.accounts[normalAddress] = accountState(normalAddress, 'ledger')
      state.main.currentAccount = normalAddress
      const network = Object.values(state.main.networks.ethereum).at(0)
      if (network) {
        network.connection.primary.connected = true
      }
      state.main.tokens = { ...state.main.tokens }
    })
    gate.setOpen(false)
    gate.setOpen(true)

    expect(balances.setAddress.mock.calls).toEqual([[normalAddress]])
    expect(balances.addNetworks.mock.calls).toHaveLength(0)
    expect(balances.addTokens.mock.calls).toHaveLength(0)

    timers.advanceTimersByTime(1_000)

    expect(balances.addNetworks.mock.calls).toHaveLength(0)
    expect(balances.addTokens.mock.calls).toHaveLength(0)
    expect(balances.refresh.mock.calls).toHaveLength(0)
    expect(balances.setAddress.mock.calls).toEqual([[normalAddress]])

    scanner.close()
  })

  it('unsubscribes from outbound traffic when closed', () => {
    const balances = createBalancesMock()
    const gate = outbound(false)
    mockBalancesFactory.mockImplementationOnce(() => balances)
    const scanner = externalData(isolatedStore(normalAddress), gate)

    scanner.close()
    gate.setOpen(true)

    expect(balances.start.mock.calls).toHaveLength(0)
    expect(balances.stop.mock.calls).toHaveLength(1)
  })
})

describe('address updates', () => {
  const address = '0x0000000000000000000000000000000000001234'

  it('runs a targeted one-shot refresh when selecting a watch account', () => {
    store.setState((state) => {
      state.main.accounts[address] = accountState(address, 'Address')
      state.main.currentAccount = address
    })

    timers.advanceTimersByTime(800)

    expect(mockBalances.setAddress).toHaveBeenCalledWith('')
    expect(mockBalances.refresh).toHaveBeenCalledWith(address)
  })

  it('allows a manual on-chain refresh for a watch account', () => {
    store.setState((state) => {
      state.main.accounts[address] = accountState(address, 'Address')
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
  const firstScanner = externalData(firstStore, outbound())
  const secondScanner = externalData(secondStore, outbound())
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
    state.main.accounts[address] = accountState(address, 'ledger')
    state.main.currentAccount = address
    const network = Object.values(state.main.networks.ethereum).at(0)
    if (network) {
      network.connection.primary.connected = true
    }
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

function setTrayShown(shown: boolean) {
  store.setState((state) => {
    state.tray.open = shown
  })

  timers.advanceTimersByTime(1000 * 60)
}
