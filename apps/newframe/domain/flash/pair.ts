import { FLASH_ANVIL_CHAIN_ID, FLASH_USDC_ASSET_SYMBOL, FLASH_WETH_ASSET_SYMBOL } from './constants'
import { getFlashAssetsForChain, normalizeFlashAddress, toFlashApiAssetAddress } from './assets'
import type { FlashAsset, FlashTradeSide } from './schemas'

export interface FlashAssetBalance {
  id?: string
  assetId?: string
  symbol?: string
  balance?: string
}

export type FlashAssetBalances = readonly FlashAssetBalance[]

interface FlashAssetPair {
  side: FlashTradeSide
  targetAsset: FlashAsset
  contraAsset: FlashAsset
}

interface FlashDefaultAssetOptions {
  assets?: readonly FlashAsset[]
  targetAsset: FlashAsset
  balances?: FlashAssetBalances | null
  side?: FlashTradeSide
}

function getFlashDefaultContraAssetPriority(chainId: number) {
  const assets = getFlashAssetsForChain(chainId)
  const usdc = assets.find((asset) => asset.symbol === FLASH_USDC_ASSET_SYMBOL)
  const weth = assets.find((asset) => asset.symbol === FLASH_WETH_ASSET_SYMBOL)
  const nativeEth = assets.find((asset) => asset.isNative)

  return [usdc, weth, nativeEth].filter(Boolean) as FlashAsset[]
}

export function getSpentAsset({ side, targetAsset, contraAsset }: FlashAssetPair): FlashAsset {
  return side === 'buy' ? contraAsset : targetAsset
}

export function getReceiveAsset({ side, targetAsset, contraAsset }: FlashAssetPair): FlashAsset {
  return side === 'buy' ? targetAsset : contraAsset
}

export function getDirectionLabel(side: FlashTradeSide): 'BUY' | 'SELL' {
  return side === 'buy' ? 'BUY' : 'SELL'
}

export function getContraPreposition(side: FlashTradeSide): 'with' | 'for' {
  return side === 'buy' ? 'with' : 'for'
}

export function formatPairIntent({ side, targetAsset, contraAsset }: FlashAssetPair): string {
  return `${targetAsset.symbol} ${side === 'buy' ? '<-' : '->'} ${contraAsset.symbol}`
}

export function isSameFlashAsset(a?: FlashAsset | null, b?: FlashAsset | null) {
  if (!a || !b) return false
  return (
    a.id === b.id ||
    (a.chainId === b.chainId &&
      normalizeFlashAddress(toFlashApiAssetAddress(a)) ===
        normalizeFlashAddress(toFlashApiAssetAddress(b))) ||
    (a.chainId === b.chainId && a.symbol.toUpperCase() === b.symbol.toUpperCase())
  )
}

export function getDefaultContraAsset({
  assets,
  targetAsset,
  balances,
  side
}: FlashDefaultAssetOptions): FlashAsset {
  const defaultCandidates = getFlashDefaultContraAssetPriority(targetAsset.chainId).filter(
    (asset) => !isSameFlashAsset(asset, targetAsset)
  )
  const sameChainOptions = sortContraCandidates(
    (assets || getFlashDefaultContraAssetPriority(targetAsset.chainId)).filter(
      (asset) => asset.chainId === targetAsset.chainId && !isSameFlashAsset(asset, targetAsset)
    )
  )
  const candidates =
    side === 'sell'
      ? uniqueFlashAssets(
          sortContraCandidates([...sameChainOptions, ...defaultCandidates].filter(isPreferredSellContraAsset))
        )
      : sameChainOptions.length
        ? sameChainOptions
        : defaultCandidates

  return (
    candidates.find((asset) => hasAssetBalance(asset, balances)) ||
    candidates[0] ||
    getFlashDefaultContraAssetPriority(FLASH_ANVIL_CHAIN_ID)[0]
  )
}

export function getDefaultContraAssetForChain({
  assets,
  balances,
  chainId
}: {
  assets?: readonly FlashAsset[]
  balances?: FlashAssetBalances | null
  chainId: number
}) {
  const candidates = uniqueFlashAssets(
    sortContraCandidates(
      [
        ...(assets || []).filter((asset) => asset.chainId === chainId && isPreferredSellContraAsset(asset)),
        ...getFlashDefaultContraAssetPriority(chainId)
      ].filter((asset) => asset.chainId === chainId && isPreferredSellContraAsset(asset))
    )
  )

  return (
    candidates.find((asset) => hasAssetBalance(asset, balances)) ||
    candidates[0] ||
    getFlashDefaultContraAssetPriority(FLASH_ANVIL_CHAIN_ID)[0]
  )
}

export function getDefaultSide({ targetAsset, balances }: FlashDefaultAssetOptions): FlashTradeSide {
  if (!balances) return 'sell'

  return hasAssetBalance(targetAsset, balances) ? 'sell' : 'buy'
}

function isPreferredSellContraAsset(asset: FlashAsset) {
  return (
    asset.symbol.toUpperCase() === FLASH_USDC_ASSET_SYMBOL ||
    asset.isNative ||
    asset.symbol.toUpperCase() === FLASH_WETH_ASSET_SYMBOL
  )
}

function uniqueFlashAssets(assets: FlashAsset[]) {
  return assets.filter(
    (asset, index) => assets.findIndex((candidate) => isSameFlashAsset(candidate, asset)) === index
  )
}

function sortContraCandidates(assets: FlashAsset[]) {
  const priority = (asset: FlashAsset) => {
    if (asset.symbol.toUpperCase() === FLASH_USDC_ASSET_SYMBOL) return 0
    if (asset.symbol.toUpperCase() === FLASH_WETH_ASSET_SYMBOL) return 1
    if (asset.isNative) return 2
    return 3
  }

  return [...assets].sort((a, b) => priority(a) - priority(b))
}

function hasAssetBalance(asset: FlashAsset, balances?: FlashAssetBalances | null) {
  const value = balances?.find((balance) => isAssetBalanceForAsset(balance, asset))?.balance
  return hasBalanceValue(value)
}

function isAssetBalanceForAsset(balance: FlashAssetBalance, asset: FlashAsset) {
  return (
    balance.assetId === asset.id ||
    balance.id === asset.id ||
    balance.symbol?.toUpperCase() === asset.symbol.toUpperCase()
  )
}

function hasBalanceValue(value?: string) {
  if (!value) return false
  const normalized = value.trim().replace(/,/g, '')
  if (!normalized) return false
  if (/^0x[0-9a-f]+$/i.test(normalized)) return BigInt(normalized) > 0n
  if (/^-?\d+$/.test(normalized)) return BigInt(normalized) > 0n

  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed > 0
}
