import { BUILT_IN_CHAINS } from '../chain/catalog.js'
import { FLASH_ANVIL_CHAIN_ID, FLASH_USDC_ADDRESS, FLASH_WETH_ADDRESS } from './constants.js'
import type { FlashRuntime } from './schemas.js'

type FlashProfile = 'dev' | 'prod'

interface FlashChainConfig {
  chainId: number
  slug: string
  profiles: readonly FlashProfile[]
  weth?: string
  usdc?: string
}

const FLASH_CHAIN_REGISTRY: readonly FlashChainConfig[] = [
  ...BUILT_IN_CHAINS.filter(({ flash }) => flash)
    .sort((left, right) => left.flash!.order - right.flash!.order)
    .map(({ id, flash }) => ({
      chainId: id,
      slug: flash!.slug,
      profiles: ['prod'] as const,
      weth: flash!.weth,
      usdc: flash!.usdc
    })),
  {
    chainId: FLASH_ANVIL_CHAIN_ID,
    slug: 'anvil',
    profiles: ['dev'],
    weth: FLASH_WETH_ADDRESS,
    usdc: FLASH_USDC_ADDRESS
  }
]

function flashProfile(runtime: FlashRuntime): FlashProfile {
  return runtime.profile === 'dev' || runtime.isDev === true || runtime.environment === 'development'
    ? 'dev'
    : 'prod'
}

export function getFlashChainConfig(chainId: number) {
  return FLASH_CHAIN_REGISTRY.find((config) => config.chainId === Number(chainId))
}

export function getFlashSupportedChainIds(runtime: FlashRuntime = {}): number[] {
  const profile = flashProfile(runtime)
  return FLASH_CHAIN_REGISTRY.filter((config) => config.profiles.includes(profile)).map(
    (config) => config.chainId
  )
}

export function isFlashChainSupported(chainId: number, runtime: FlashRuntime = {}) {
  return getFlashSupportedChainIds(runtime).includes(Number(chainId))
}

export function getFlashChainSlug(chainId: number) {
  return getFlashChainConfig(chainId)?.slug || ''
}

export function getFlashChainIdFromSlug(slug: string) {
  return FLASH_CHAIN_REGISTRY.find((config) => config.slug === slug.trim().toLowerCase())?.chainId
}

export function getFlashDefaultChainId(runtime: FlashRuntime = {}, availableChainIds?: readonly number[]) {
  const supported = getFlashSupportedChainIds(runtime)
  const available = (availableChainIds || [])
    .map(Number)
    .filter((chainId) => Number.isInteger(chainId) && supported.includes(chainId))

  return available[0] || supported[0] || FLASH_ANVIL_CHAIN_ID
}
