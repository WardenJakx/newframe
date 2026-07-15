import { getFlashChainConfig } from './chains'
import {
  FLASH_ANVIL_CHAIN_ID,
  FLASH_NATIVE_ETH_ASSET_SYMBOL,
  FLASH_NATIVE_ETH_TOKEN_ADDRESS,
  FLASH_USDC_ADDRESS,
  FLASH_USDC_ASSET_SYMBOL,
  FLASH_WETH_ADDRESS,
  FLASH_WETH_ASSET_SYMBOL
} from './constants'
import { FlashAssetSchema, type FlashAsset } from './schemas'

interface FlashBalanceSummaryLike {
  address?: unknown
  balance?: unknown
  chainId?: unknown
  decimals?: unknown
  name?: unknown
  symbol?: unknown
}

export function normalizeFlashAddress(address?: unknown) {
  const value = typeof address === 'string' ? address.trim().toLowerCase() : ''

  return /^0x[0-9a-f]{40}$/.test(value) ? value : FLASH_NATIVE_ETH_TOKEN_ADDRESS
}

export function flashAssetId(chainId: number, address: string) {
  return `${chainId}:${normalizeFlashAddress(address)}`
}

function createFlashAsset({
  address,
  chainId,
  decimals,
  isNative,
  name,
  symbol
}: {
  address: string
  chainId: number
  decimals: number
  isNative: boolean
  name: string
  symbol: string
}): FlashAsset {
  const normalizedAddress = normalizeFlashAddress(address)

  return FlashAssetSchema.parse({
    id: flashAssetId(chainId, normalizedAddress),
    symbol,
    name,
    decimals,
    chainId,
    isNative,
    address: normalizedAddress
  })
}

export const FLASH_NATIVE_ETH_ASSET_ID = flashAssetId(FLASH_ANVIL_CHAIN_ID, FLASH_NATIVE_ETH_TOKEN_ADDRESS)
export const FLASH_WETH_ASSET_ID = flashAssetId(FLASH_ANVIL_CHAIN_ID, FLASH_WETH_ADDRESS)
export const FLASH_USDC_ASSET_ID = flashAssetId(FLASH_ANVIL_CHAIN_ID, FLASH_USDC_ADDRESS)

export const FLASH_NATIVE_ETH_ASSET = createFlashAsset({
  address: FLASH_NATIVE_ETH_TOKEN_ADDRESS,
  chainId: FLASH_ANVIL_CHAIN_ID,
  decimals: 18,
  isNative: true,
  name: 'Ether',
  symbol: FLASH_NATIVE_ETH_ASSET_SYMBOL
})

export const FLASH_WETH_ASSET = createFlashAsset({
  address: FLASH_WETH_ADDRESS,
  chainId: FLASH_ANVIL_CHAIN_ID,
  decimals: 18,
  isNative: false,
  name: 'Wrapped Ether',
  symbol: FLASH_WETH_ASSET_SYMBOL
})

export const FLASH_USDC_ASSET = createFlashAsset({
  address: FLASH_USDC_ADDRESS,
  chainId: FLASH_ANVIL_CHAIN_ID,
  decimals: 6,
  isNative: false,
  name: 'USD Coin',
  symbol: FLASH_USDC_ASSET_SYMBOL
})

export const FLASH_DEFAULT_TARGET_ASSET = FLASH_WETH_ASSET

export function toFlashApiAssetAddress(asset: FlashAsset) {
  return asset.isNative ? FLASH_NATIVE_ETH_TOKEN_ADDRESS : normalizeFlashAddress(asset.address)
}

export function balanceSummaryToFlashAsset(balance: FlashBalanceSummaryLike): FlashAsset {
  const chainId = Number(balance.chainId)
  if (!Number.isInteger(chainId) || chainId <= 0) throw new Error('Invalid Flash balance chain id')

  const address = normalizeFlashAddress(balance.address)
  const isNative = address === FLASH_NATIVE_ETH_TOKEN_ADDRESS
  const symbol = String(balance.symbol || (isNative ? FLASH_NATIVE_ETH_ASSET_SYMBOL : '')).trim()
  if (!symbol) throw new Error('Invalid Flash balance symbol')

  const decimals = Number(balance.decimals)

  return createFlashAsset({
    address,
    chainId,
    decimals: Number.isInteger(decimals) && decimals >= 0 ? decimals : 18,
    isNative,
    name: String(balance.name || symbol),
    symbol
  })
}

export function getFlashAssetsForChain(chainId: number): FlashAsset[] {
  const normalizedChainId = Number(chainId)
  const config = getFlashChainConfig(normalizedChainId)

  if (!config?.weth || !config.usdc) {
    return [
      createFlashAsset({
        address: FLASH_NATIVE_ETH_TOKEN_ADDRESS,
        chainId: normalizedChainId,
        decimals: 18,
        isNative: true,
        name: 'Native Asset',
        symbol: FLASH_NATIVE_ETH_ASSET_SYMBOL
      })
    ]
  }

  return [
    createFlashAsset({
      address: FLASH_NATIVE_ETH_TOKEN_ADDRESS,
      chainId: normalizedChainId,
      decimals: 18,
      isNative: true,
      name: 'Ether',
      symbol: FLASH_NATIVE_ETH_ASSET_SYMBOL
    }),
    createFlashAsset({
      address: config.weth,
      chainId: normalizedChainId,
      decimals: 18,
      isNative: false,
      name: 'Wrapped Ether',
      symbol: FLASH_WETH_ASSET_SYMBOL
    }),
    createFlashAsset({
      address: config.usdc,
      chainId: normalizedChainId,
      decimals: 6,
      isNative: false,
      name: 'USD Coin',
      symbol: FLASH_USDC_ASSET_SYMBOL
    })
  ]
}

export function getFlashDefaultTargetAsset(chainId = FLASH_ANVIL_CHAIN_ID) {
  const assets = getFlashAssetsForChain(chainId)

  return (
    assets.find((asset) => asset.symbol === FLASH_WETH_ASSET_SYMBOL) ||
    assets[0] || {
      ...FLASH_DEFAULT_TARGET_ASSET,
      chainId,
      id: flashAssetId(chainId, toFlashApiAssetAddress(FLASH_DEFAULT_TARGET_ASSET))
    }
  )
}
