import type { CanonicalStoreReader } from '../../../../platform/state-store/actions.js'
import type { Balance, NativeCurrency, Token } from '../../../../platform/state-store/state/index.js'
import { resolveAssetRate } from '../../../asset-data/domain/asset/index.js'
import { NATIVE_CURRENCY } from '../../../tokens/domain/constants.js'
import { toTokenId } from '../../../tokens/domain/index.js'

type UsdRate = { usd: { price: number; change24hr?: number } }
type CanonicalStoreApi = CanonicalStoreReader

interface AssetsChangedHandler {
  assetsChanged: (address: Address, assets: RPC.GetAssets.Assets) => void
}

// typed access to state
const createStoreApi = (store: CanonicalStoreApi) => ({
  getBalances: (account: Address): Balance[] => {
    const balances = store.getState().main.balances as Record<string, Balance[] | undefined>
    return balances[account] ?? []
  },
  getNativeCurrency: (chainId: number): NativeCurrency | undefined =>
    store.getState().main.networksMeta.ethereum[chainId]?.nativeCurrency,
  getToken: (balance: Balance): Token | undefined => {
    const tokens = store.getState().main.tokens.byId as Record<string, Token | undefined>
    return tokens[toTokenId(balance)]
  },
  getUsdRate: (balance: Balance, nativeTicker?: string): UsdRate | undefined => {
    const rate = resolveAssetRate(
      { chainId: balance.chainId, address: balance.address, nativeTicker },
      store.getState().main.assetRates
    )

    return rate
      ? {
          usd: {
            price: rate.usdRate,
            ...(rate.change24hr === undefined ? {} : { change24hr: rate.change24hr })
          }
        }
      : undefined
  },
  getLastUpdated: (account: Address): number => {
    const accountState = store.getState().main.accounts[account] as unknown as
      | { balances?: { lastUpdated?: number } }
      | undefined
    return accountState?.balances?.lastUpdated ?? 0
  }
})

function createObserver(store: CanonicalStoreApi, handler: AssetsChangedHandler) {
  let debouncedAssets: { accountId: string; assets: RPC.GetAssets.Assets } | null = null

  return function () {
    const currentAccountId = store.getState().main.currentAccount

    if (currentAccountId) {
      const assets = fetchAssets(store, currentAccountId)

      if (
        !isScanning(store, currentAccountId) &&
        (assets.erc20.length > 0 || assets.nativeCurrency.length > 0)
      ) {
        if (!debouncedAssets) {
          setTimeout(() => {
            const pending = debouncedAssets
            debouncedAssets = null
            if (!pending || store.getState().main.currentAccount !== pending.accountId) {
              return
            }

            handler.assetsChanged(pending.accountId, pending.assets)
          }, 800)
        }

        debouncedAssets = { accountId: currentAccountId, assets }
      }
    }
  }
}

function loadAssets(store: CanonicalStoreApi, accountId: string) {
  if (isScanning(store, accountId)) {
    throw new Error('assets not known for account')
  }

  return fetchAssets(store, accountId)
}

function fetchAssets(store: CanonicalStoreApi, accountId: string) {
  const storeApi = createStoreApi(store)
  const balances = storeApi.getBalances(accountId)

  const response = {
    nativeCurrency: [] as RPC.GetAssets.NativeCurrency[],
    erc20: [] as RPC.GetAssets.Erc20[]
  }

  return balances.reduce((assets, balance) => {
    if (balance.address === NATIVE_CURRENCY) {
      const currency = storeApi.getNativeCurrency(balance.chainId)
      if (!currency) {
        return assets
      }

      assets.nativeCurrency.push({
        ...balance,
        decimals: currency.decimals,
        name: currency.name,
        symbol: currency.symbol,
        currencyInfo: currency
      })
    } else {
      const usdRate = storeApi.getUsdRate(balance)
      const token = storeApi.getToken(balance)
      if (!token) {
        return assets
      }

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

function isScanning(store: CanonicalStoreApi, account: Address) {
  const lastUpdated = createStoreApi(store).getLastUpdated(account)
  return !lastUpdated || new Date().getTime() - lastUpdated > 1000 * 60 * 5
}

export { loadAssets, createObserver }
