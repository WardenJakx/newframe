import { NATIVE_CURRENCY } from '../../../tokens/domain/constants.js'
import { CURATED_ASSETS, type CuratedAsset } from './registry.js'
import type { AssetRateMap, AssetRateReference, ResolvedAssetRate } from '../state/rate.js'

export type { AssetLabel, CuratedAsset } from './registry.js'

const assetsById: ReadonlyMap<string, CuratedAsset> = new Map(
  CURATED_ASSETS.map((asset) => [asset.assetId, asset])
)
const CURATED_TOKEN_ASSETS = Object.freeze(
  CURATED_ASSETS.filter(
    (asset): asset is CuratedAsset & { readonly address: Address } =>
      Boolean(asset.address) && asset.address !== NATIVE_CURRENCY
  )
)

export function toErc20AssetId(chainId: number, address: Address) {
  return `${chainId}:${address.toLowerCase()}`
}

export function toNativeAssetId(chainId: number, ticker: string) {
  return `${chainId}:${ticker.toUpperCase()}`
}

export function toAssetId(asset: AssetRateReference, nativeTicker = asset.nativeTicker) {
  if (asset.address === NATIVE_CURRENCY) {
    return nativeTicker ? toNativeAssetId(asset.chainId, nativeTicker) : undefined
  }

  return toErc20AssetId(asset.chainId, asset.address as Address)
}

export function getAssetLabel(asset: AssetRateReference, nativeTicker = asset.nativeTicker) {
  if (asset.address === NATIVE_CURRENCY) return 'native' as const
  const assetId = toAssetId(asset, nativeTicker)
  return assetId ? getCuratedAsset(assetId)?.assetLabel : undefined
}

export function getCuratedAsset(assetId: string) {
  return assetsById.get(assetId.toLowerCase())
}

export function getAssetRateKey(assetId: string) {
  if (/^\d+:ETH$/.test(assetId)) return 'ETH'
  return getCuratedAsset(assetId)?.commonAsset || assetId
}

export function resolveAssetRate(
  asset: AssetRateReference,
  assetRates: AssetRateMap,
  nativeTicker = asset.nativeTicker
): ResolvedAssetRate | undefined {
  const assetId = toAssetId(asset, nativeTicker)
  if (!assetId) return undefined

  const curated = getCuratedAsset(assetId)
  if (curated?.fixedUsdRate !== undefined) {
    return { usdRate: curated.fixedUsdRate, source: 'fixed' }
  }

  return assetRates[getAssetRateKey(assetId)]
}

export function listCuratedAssets(): readonly CuratedAsset[] {
  return CURATED_ASSETS
}

export function listCuratedTokenAssets() {
  return CURATED_TOKEN_ASSETS
}
