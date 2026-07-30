import { getAssetRateKey, getCuratedAsset, resolveAssetRate, toAssetId } from '../../../domain/asset/index.js'
import { NATIVE_CURRENCY } from '../../../domain/token/constants.js'

import type {
  AssetRateInput,
  AssetRateReference,
  AssetRateSnapshot,
  AssetRateSource,
  ResolvedAssetRate
} from '../../../domain/state/rate.js'
import type { CanonicalStore } from '../../store/actions.js'

type AssetRateStoreState = Pick<CanonicalStore, 'main' | 'setAssetRates'>

export interface AssetRateService {
  observe(source: AssetRateSource, rates: readonly AssetRateInput[]): void
  get(asset: AssetRateReference): ResolvedAssetRate | undefined
}

export interface AssetRateServiceDependencies {
  store: { getState(): AssetRateStoreState }
  clock: { now(): number }
}

export function createAssetRateService({ store, clock }: AssetRateServiceDependencies): AssetRateService {
  const nativeTicker = (asset: AssetRateReference) =>
    asset.nativeTicker ||
    (asset.address === NATIVE_CURRENCY
      ? store.getState().main.networksMeta.ethereum[asset.chainId]?.nativeCurrency.symbol
      : undefined)

  return {
    observe(source, rates) {
      if (rates.length === 0) return

      const state = store.getState()
      const accepted: Record<string, AssetRateSnapshot> = {}

      rates.forEach((input) => {
        if (
          !Number.isFinite(input.usdRate) ||
          input.usdRate <= 0 ||
          (input.change24hr !== undefined && !Number.isFinite(input.change24hr))
        ) {
          return
        }

        const assetId = toAssetId(input, nativeTicker(input))
        if (!assetId || getCuratedAsset(assetId)?.fixedUsdRate !== undefined) return

        const observedAt = input.observedAt ?? clock.now()
        if (!Number.isFinite(observedAt)) return

        const key = getAssetRateKey(assetId)
        const previous = accepted[key] || state.main.assetRates[key]
        if (previous && observedAt < previous.observedAt) return

        accepted[key] = {
          usdRate: input.usdRate,
          ...(input.change24hr === undefined ? {} : { change24hr: input.change24hr }),
          source,
          observedAt
        }
      })

      if (Object.keys(accepted).length) state.setAssetRates(accepted)
    },

    get(asset) {
      const state = store.getState()
      return resolveAssetRate(asset, state.main.assetRates, nativeTicker(asset))
    }
  }
}
