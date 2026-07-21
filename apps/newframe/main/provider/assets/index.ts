import store from '../../store'

import { NATIVE_CURRENCY } from '../../../resources/constants'
import { toTokenId } from '../../../resources/domain/token'

import type { Balance, NativeCurrency, Rate } from '../../store/state'

type UsdRate = { usd: Rate }

interface AssetsChangedHandler {
  assetsChanged: (address: Address, assets: RPC.GetAssets.Assets) => void
}

// typed access to state
const storeApi = {
  getBalances: (account: Address): Balance[] => {
    return store.getState().main.balances[account] || []
  },
  getNativeCurrency: (chainId: number): NativeCurrency | undefined =>
    store.getState().main.networksMeta.ethereum[chainId]?.nativeCurrency,
  getToken: (balance: Balance) => store.getState().main.tokens.byId[toTokenId(balance)],
  getUsdRate: (address: Address): UsdRate | undefined => {
    const rate = store.getState().main.rates[address.toLowerCase()]

    return rate
  },
  getLastUpdated: (account: Address): number => {
    const accountState = store.getState().main.accounts[account] as unknown as {
      balances?: { lastUpdated?: number }
    }
    return accountState?.balances?.lastUpdated || 0
  }
}

function createObserver(handler: AssetsChangedHandler) {
  let debouncedAssets: RPC.GetAssets.Assets | null = null

  return function () {
    const currentAccountId = store.getState().main.currentAccount as string

    if (currentAccountId) {
      const assets = fetchAssets(currentAccountId)

      if (!isScanning(currentAccountId) && (assets.erc20.length > 0 || assets.nativeCurrency.length > 0)) {
        if (!debouncedAssets) {
          setTimeout(() => {
            if (debouncedAssets) {
              handler.assetsChanged(currentAccountId, debouncedAssets)
              debouncedAssets = null
            }
          }, 800)
        }

        debouncedAssets = assets
      }
    }
  }
}

function loadAssets(accountId: string) {
  if (isScanning(accountId)) throw new Error('assets not known for account')

  return fetchAssets(accountId)
}

function fetchAssets(accountId: string) {
  const balances = storeApi.getBalances(accountId)

  const response = {
    nativeCurrency: [] as RPC.GetAssets.NativeCurrency[],
    erc20: [] as RPC.GetAssets.Erc20[]
  }

  return balances.reduce((assets, balance) => {
    if (balance.address === NATIVE_CURRENCY) {
      const currency = storeApi.getNativeCurrency(balance.chainId)
      if (!currency) return assets

      assets.nativeCurrency.push({
        ...balance,
        decimals: currency.decimals,
        name: currency.name,
        symbol: currency.symbol,
        currencyInfo: currency
      })
    } else {
      const usdRate = storeApi.getUsdRate(balance.address)
      const token = storeApi.getToken(balance)
      if (!token) return assets

      assets.erc20.push({
        ...balance,
        decimals: token.decimals,
        name: token.name,
        symbol: token.symbol,
        tokenInfo: usdRate ? { lastKnownPrice: usdRate } : {}
      })
    }

    return assets
  }, response)
}

function isScanning(account: Address) {
  const lastUpdated = storeApi.getLastUpdated(account)
  return !lastUpdated || new Date().getTime() - lastUpdated > 1000 * 60 * 5
}

export { loadAssets, createObserver }
