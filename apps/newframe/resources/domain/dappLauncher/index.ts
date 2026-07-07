import { NATIVE_CURRENCY } from '../../constants'
import { hasPositiveBalance } from '../balance'
import { FLASH_DEFAULT_TARGET_ASSET, FLASH_P0_ASSETS, type FlashAsset } from '../flash'

export const DAPP_LAUNCHER_FRAME_ID = 'dappLauncher'
export const DAPP_LAUNCHER_NATIVE_ASSET_ADDRESS = NATIVE_CURRENCY

export type DappLauncherRouteName = 'send' | 'trade'

export interface DappLauncherRoute {
  name: DappLauncherRouteName
  searchParams: URLSearchParams
}

export interface DappLauncherFrame {
  id: typeof DAPP_LAUNCHER_FRAME_ID | string
  route?: string
}

/** @deprecated Use DappLauncherFrame objects with { id, route }. */
export type LegacyDappLauncherFrameRequest = string
export type DappLauncherFrameRequest = DappLauncherFrame | LegacyDappLauncherFrameRequest

export function normalizeDappLauncherFrameRequest(frame: DappLauncherFrameRequest): DappLauncherFrame | null {
  if (typeof frame === 'string') return frame ? { id: frame } : null
  if (!frame || typeof frame !== 'object' || typeof frame.id !== 'string' || !frame.id) return null

  return {
    id: frame.id,
    ...(typeof frame.route === 'string' && frame.route ? { route: frame.route } : {})
  }
}

export function parseDappLauncherHashRoute(hash = ''): DappLauncherRoute {
  const routeHash = hash.startsWith('#') ? hash.slice(1) : hash
  const routePath = routeHash.startsWith('/') ? routeHash : ''
  const [pathname = '', search = ''] = routePath.split('?')
  const searchParams = new URLSearchParams(search)

  if (pathname === '/trade') return { name: 'trade', searchParams }

  return { name: 'send', searchParams }
}

export function toCanonicalAssetId(asset: { chainId?: unknown; address?: unknown } | null | undefined) {
  if (!asset) return ''

  const chainId = Number(asset.chainId)
  const address = canonicalAssetAddress(asset.address)

  if (!Number.isInteger(chainId) || chainId <= 0 || !address) return ''

  return `${chainId}:${address}`
}

export function canonicalAssetAddress(address: unknown) {
  const value = typeof address === 'string' ? address.trim().toLowerCase() : ''

  return /^0x[0-9a-f]{40}$/.test(value) ? value : ''
}

export function buildDappLauncherRoute(route: DappLauncherRouteName, assetId = '') {
  const encodedAssetId = assetId ? `?assetId=${encodeURIComponent(assetId)}` : ''

  return `/${route}${encodedAssetId}`
}

export function resolveSendAssetFromRouteAssetId<
  T extends { chainId?: unknown; address?: unknown; balance?: string }
>(assetId: string | null | undefined, assets: T[]) {
  const sendableAssets = assets.filter(hasPositiveBalance)
  const routeAsset = parseCanonicalAssetId(assetId)

  if (routeAsset) {
    const routeAssetId = `${routeAsset.chainId}:${routeAsset.address}`
    const selectedAsset = sendableAssets.find((asset) => toCanonicalAssetId(asset) === routeAssetId)
    if (selectedAsset) return selectedAsset
  }

  return sendableAssets[0] || null
}

export function resolveFlashAssetFromRouteAssetId(assetId?: string | null): FlashAsset {
  const routeAsset = parseCanonicalAssetId(assetId)

  if (!routeAsset) return FLASH_DEFAULT_TARGET_ASSET

  return (
    FLASH_P0_ASSETS.find((asset) => {
      return (
        Number(asset.chainId) === routeAsset.chainId &&
        canonicalAssetAddress(asset.isNative ? DAPP_LAUNCHER_NATIVE_ASSET_ADDRESS : asset.address) ===
          routeAsset.address
      )
    }) || FLASH_DEFAULT_TARGET_ASSET
  )
}

export function parseCanonicalAssetId(assetId?: string | null) {
  if (!assetId) return null

  const [chainIdValue, addressValue, ...extra] = assetId.split(':')
  const chainId = Number(chainIdValue)
  const address = canonicalAssetAddress(addressValue)

  if (extra.length > 0 || !Number.isInteger(chainId) || chainId <= 0 || !address) return null

  return { chainId, address }
}

export function isNativeRouteAssetId(assetId?: string | null) {
  return parseCanonicalAssetId(assetId)?.address === FLASH_NATIVE_ETH_ASSET_ADDRESS
}

const FLASH_NATIVE_ETH_ASSET_ADDRESS = DAPP_LAUNCHER_NATIVE_ASSET_ADDRESS
