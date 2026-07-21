import { createObserver, loadAssets } from '../../../../main/provider/assets'
import store from '../../../../main/store'

const account = '0x3ba7bd5cd1c19f678d9c8edfa043de5a57570e06'
const nativeCurrency = (usd: { price: number }) => ({
  decimals: 18,
  icon: '',
  name: 'Ether',
  symbol: 'ETH',
  usd
})

function setToken(state: any, balance: { address: string; chainId: number }, symbol: string) {
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

beforeEach(() => {
  // ensure that the balances have been updated within the range to not be considered stale
  store.setState((state: any) => {
    state.main.accounts[account] = { balances: { lastUpdated: new Date() } }
    state.main.tokens.byId = {}
  })
})

describe('#loadAssets', () => {
  it('loads native currency assets', () => {
    const priceData = { usd: { price: 3815.91 } }
    const balance = {
      symbol: 'ETH',
      balance: '0xe7',
      address: '0x0000000000000000000000000000000000000000',
      chainId: 1
    }

    store.setState((state: any) => {
      state.main.networksMeta.ethereum[1] = { nativeCurrency: nativeCurrency(priceData.usd) }
      state.main.balances[account] = [balance]
    })

    expect(loadAssets(account)).toEqual({
      nativeCurrency: [
        {
          ...balance,
          decimals: 18,
          name: 'Ether',
          currencyInfo: nativeCurrency(priceData.usd)
        }
      ],
      erc20: []
    })
  })

  it('loads token assets', () => {
    const priceData = { usd: { price: 225.35 } }
    const balance = {
      symbol: 'OHM',
      balance: '0x606401fc9',
      address: '0x383518188c0c6d7730d91b2c03a03c837814a899',
      chainId: 1
    }

    store.setState((state: any) => {
      state.main.rates[balance.address] = priceData
      state.main.balances[account] = [balance]
      setToken(state, balance, balance.symbol)
    })

    expect(loadAssets(account)).toEqual({
      nativeCurrency: [],
      erc20: [
        {
          ...balance,
          decimals: 18,
          name: 'OHM',
          tokenInfo: { lastKnownPrice: { ...priceData } }
        }
      ]
    })
  })

  it('loads token assets without a last known price when no quote is available', () => {
    const balance = {
      symbol: 'UNKNOWN',
      balance: '0x606401fc9',
      address: '0x1111111111111111111111111111111111111111',
      chainId: 1
    }

    store.setState((state: any) => {
      state.main.balances[account] = [balance]
      setToken(state, balance, balance.symbol)
    })

    expect(loadAssets(account)).toEqual({
      nativeCurrency: [],
      erc20: [{ ...balance, decimals: 18, name: 'UNKNOWN', tokenInfo: {} }]
    })
  })

  it('ignores a stale native balance after its network has been removed', () => {
    store.setState((state: any) => {
      state.main.balances[account] = [
        {
          symbol: 'ETH',
          balance: '0xe7',
          address: '0x0000000000000000000000000000000000000000',
          chainId: 31337
        }
      ]
      delete state.main.networksMeta.ethereum[31337]
    })

    expect(loadAssets(account)).toEqual({ nativeCurrency: [], erc20: [] })
  })

  it('throws an error if assets have not been updated in the last 5 minutes', () => {
    const tooOld = new Date()
    tooOld.setMinutes(tooOld.getMinutes() - 6)

    store.setState((state: any) => {
      state.main.accounts[account].balances.lastUpdated = tooOld
    })

    expect(() => loadAssets(account)).toThrow(/assets not known/)
  })
})

describe('#createObserver', () => {
  const handler = { assetsChanged: jest.fn() }
  const observer = createObserver(handler)

  const fireObserver = (waitTime = 800) => {
    observer()

    // event debounce time is 800 ms
    jest.advanceTimersByTime(waitTime)
  }

  beforeEach(() => {
    handler.assetsChanged = jest.fn()

    store.setState((state: any) => {
      state.main.currentAccount = account
      const balance = {
        address: '0x1111111111111111111111111111111111111111',
        balance: '0x1',
        chainId: 1
      }
      state.main.balances[account] = [balance]
      setToken(state, balance, 'TEST')
    })
  })

  it('invokes the handler when the account is holding native currency assets', () => {
    const priceData = { usd: { price: 3815.91 } }
    const balance = {
      symbol: 'ETH',
      balance: '0xe7',
      address: '0x0000000000000000000000000000000000000000',
      chainId: 1
    }

    store.setState((state: any) => {
      state.main.networksMeta.ethereum[1] = { nativeCurrency: nativeCurrency(priceData.usd) }
      state.main.balances[account] = [balance]
    })

    fireObserver()

    expect(handler.assetsChanged).toHaveBeenCalledWith(account, {
      nativeCurrency: [
        {
          ...balance,
          decimals: 18,
          name: 'Ether',
          currencyInfo: nativeCurrency(priceData.usd)
        }
      ],
      erc20: []
    })
  })

  it('invokes the handler when the account is holding token assets', () => {
    const priceData = { usd: { price: 225.35 } }
    const balance = {
      symbol: 'OHM',
      balance: '0x606401fc9',
      address: '0x383518188c0c6d7730d91b2c03a03c837814a899',
      chainId: 1
    }

    store.setState((state: any) => {
      state.main.rates[balance.address] = priceData
      state.main.balances[account] = [balance]
      setToken(state, balance, balance.symbol)
    })

    fireObserver()

    expect(handler.assetsChanged).toHaveBeenCalledWith(account, {
      nativeCurrency: [],
      erc20: [
        {
          ...balance,
          decimals: 18,
          name: 'OHM',
          tokenInfo: { lastKnownPrice: { ...priceData } }
        }
      ]
    })
  })

  it('does not invoke the handler when no account is selected', () => {
    store.setState((state: any) => {
      state.main.currentAccount = ''
    })

    fireObserver()

    expect(handler.assetsChanged).not.toHaveBeenCalled()
  })

  it('does not invoke the handler when no assets are present', () => {
    store.setState((state: any) => {
      state.main.balances[account] = []
    })

    fireObserver()

    expect(handler.assetsChanged).not.toHaveBeenCalled()
  })

  it('does not invoke the handler while scanning', () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)

    store.setState((state: any) => {
      state.main.accounts[account].balances.lastUpdated = yesterday
    })

    fireObserver()

    expect(handler.assetsChanged).not.toHaveBeenCalled()
  })

  it('only invokes the handler once in any 800 ms span', () => {
    fireObserver(500)
    fireObserver(500)

    expect(handler.assetsChanged).toHaveBeenCalledTimes(1)
  })
})
