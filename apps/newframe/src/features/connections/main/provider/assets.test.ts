import { afterEach, beforeEach, describe, expect, it, jest as timers, mock } from 'bun:test'

import type { Draft } from 'immer'

import store from '../../../../platform/state-store'
import type { CanonicalStore } from '../../../../platform/state-store'
import { createObserver, loadAssets } from './assets'

const account = '0x3ba7bd5cd1c19f678d9c8edfa043de5a57570e06'
const nativeBalance = {
  symbol: 'ETH',
  balance: '0xe7',
  address: '0x0000000000000000000000000000000000000000',
  chainId: 1,
  displayBalance: '0'
}
const tokenBalance = {
  symbol: 'OHM',
  balance: '0x606401fc9',
  address: '0x383518188c0c6d7730d91b2c03a03c837814a899',
  chainId: 1,
  displayBalance: '0'
}
const tokenPrice = { usd: { price: 225.35 } }
const nativeCurrency = () => ({
  decimals: 18,
  icon: '',
  name: 'Ether',
  symbol: 'ETH'
})

type MutableStore = Draft<CanonicalStore>

const accountBalances = (state: MutableStore) =>
  state.main.accounts[account].balances as { lastUpdated: Date }

function setToken(state: MutableStore, balance: { address: string; chainId: number }, symbol: string) {
  state.main.tokens.byId[`${balance.chainId}:${balance.address}`] = {
    address: balance.address,
    chainId: balance.chainId,
    custom: false,
    curated: false,
    decimals: 18,
    name: symbol,
    sources: ['onchain'],
    symbol,
    updatedAt: 0
  }
}

function setTokenBalance(state: MutableStore, balance = tokenBalance, withPrice = false) {
  state.main.balances[account] = [balance]
  setToken(state, balance, balance.symbol)
  if (withPrice) {
    state.main.assetRates[`1:${balance.address}`] = {
      usdRate: tokenPrice.usd.price,
      source: 'zerion',
      observedAt: 1
    }
  }
}

beforeEach(() => {
  timers.useFakeTimers()

  // ensure that the balances have been updated within the range to not be considered stale
  store.setState((state) => {
    state.main.accounts[account] = {
      balances: { lastUpdated: new Date() }
    } as unknown as (typeof state.main.accounts)[string]
    state.main.tokens.byId = {}
  })
})

afterEach(() => {
  timers.useRealTimers()
})

describe('#loadAssets', () => {
  it('loads native currency assets', () => {
    store.setState((state) => {
      state.main.networksMeta.ethereum[1] = {
        nativeCurrency: nativeCurrency()
      } as unknown as (typeof state.main.networksMeta.ethereum)[number]
      state.main.balances[account] = [nativeBalance]
    })

    expect(loadAssets(store, account)).toEqual({
      nativeCurrency: [
        {
          ...nativeBalance,
          decimals: 18,
          name: 'Ether',
          currencyInfo: nativeCurrency()
        }
      ],
      erc20: []
    })
  })

  it('loads token assets', () => {
    store.setState((state) => {
      setTokenBalance(state, tokenBalance, true)
    })

    expect(loadAssets(store, account)).toEqual({
      nativeCurrency: [],
      erc20: [
        {
          ...tokenBalance,
          decimals: 18,
          name: 'OHM',
          tokenInfo: { lastKnownPrice: tokenPrice }
        }
      ]
    })
  })

  it('loads token assets without a last known price when no quote is available', () => {
    const balance = {
      symbol: 'UNKNOWN',
      balance: '0x606401fc9',
      address: '0x1111111111111111111111111111111111111111',
      chainId: 1,
      displayBalance: '0'
    }

    store.setState((state) => {
      state.main.balances[account] = [balance]
      setToken(state, balance, balance.symbol)
    })

    expect(loadAssets(store, account)).toEqual({
      nativeCurrency: [],
      erc20: [{ ...balance, decimals: 18, name: 'UNKNOWN', tokenInfo: {} }]
    })
  })

  it('ignores a stale native balance after its network has been removed', () => {
    store.setState((state) => {
      state.main.balances[account] = [{ ...nativeBalance, chainId: 31337 }]
      delete state.main.networksMeta.ethereum[31337]
    })

    expect(loadAssets(store, account)).toEqual({
      nativeCurrency: [],
      erc20: []
    })
  })

  it('throws an error if assets have not been updated in the last 5 minutes', () => {
    const tooOld = new Date(Date.now() - 6 * 60 * 1000)

    store.setState((state) => {
      accountBalances(state).lastUpdated = tooOld
    })

    expect(() => loadAssets(store, account)).toThrow(/assets not known/)
  })
})

describe('#createObserver', () => {
  const handler = { assetsChanged: mock() }
  const observer = createObserver(store, handler)

  const fireObserver = (waitTime = 800) => {
    observer()

    // event debounce time is 800 ms
    timers.advanceTimersByTime(waitTime)
  }

  beforeEach(() => {
    handler.assetsChanged = mock()

    store.setState((state) => {
      state.main.currentAccount = account
      setTokenBalance(state)
    })
  })

  it('invokes the handler when the account is holding native currency assets', () => {
    store.setState((state) => {
      state.main.networksMeta.ethereum[1] = {
        nativeCurrency: nativeCurrency()
      } as unknown as (typeof state.main.networksMeta.ethereum)[number]
      state.main.balances[account] = [nativeBalance]
    })

    const expected = loadAssets(store, account)
    fireObserver()

    expect(handler.assetsChanged).toHaveBeenCalledWith(account, expected)
  })

  it('invokes the handler when the account is holding token assets', () => {
    store.setState((state) => {
      setTokenBalance(state, tokenBalance, true)
    })

    const expected = loadAssets(store, account)
    fireObserver()

    expect(handler.assetsChanged).toHaveBeenCalledWith(account, expected)
  })
  ;[
    ['no account is selected', (state: MutableStore) => void (state.main.currentAccount = '')],
    ['no assets are present', (state: MutableStore) => void (state.main.balances[account] = [])],
    [
      'asset scanning is stale',
      (state: MutableStore) => void (accountBalances(state).lastUpdated = new Date(0))
    ]
  ].forEach(([description, arrange]) => {
    it(`does not invoke the handler when ${description}`, () => {
      store.setState(arrange as (state: MutableStore) => void)
      fireObserver()
      expect(handler.assetsChanged).not.toHaveBeenCalled()
    })
  })

  it('only invokes the handler once in any 800 ms span', () => {
    fireObserver(500)
    fireObserver(500)

    expect(handler.assetsChanged).toHaveBeenCalledTimes(1)
  })

  it('publishes only the latest still-current account from a shared debounce', () => {
    const nextAccount = '0x2222222222222222222222222222222222222222'
    const nextBalance = {
      address: '0x3333333333333333333333333333333333333333',
      balance: '0x2',
      chainId: 1
    }

    observer()
    timers.advanceTimersByTime(400)
    store.setState((state) => {
      state.main.currentAccount = nextAccount
      state.main.accounts[nextAccount] = {
        balances: { lastUpdated: new Date() }
      } as unknown as (typeof state.main.accounts)[string]
      state.main.balances[nextAccount] = [nextBalance] as unknown as (typeof state.main.balances)[string]
      setToken(state, nextBalance, 'NEXT')
    })
    observer()
    timers.advanceTimersByTime(400)

    const expected = loadAssets(store, nextAccount)
    expect(handler.assetsChanged).toHaveBeenCalledTimes(1)
    expect(handler.assetsChanged).toHaveBeenCalledWith(nextAccount, expected)
  })
})
