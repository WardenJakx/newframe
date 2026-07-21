import { afterEach, beforeAll, beforeEach, describe, expect, it, jest as timers, mock } from 'bun:test'

import store from '../../../main/store'

const mockBalancesFactory = mock(() => mockBalances)

mock.module('../../../main/externalData/balances', () => ({ default: mockBalancesFactory }))

let dataManager: any, externalData: any, mockBalances: any

beforeAll(async () => {
  externalData = (await import('../../../main/externalData')).default
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
  dataManager = externalData()
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
