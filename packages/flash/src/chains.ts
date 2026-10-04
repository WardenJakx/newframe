import {
  FLASH_ANVIL_CHAIN_ID,
  FLASH_BASE_USDC_ADDRESS,
  FLASH_BASE_WETH_ADDRESS,
  FLASH_USDC_ADDRESS,
  FLASH_WETH_ADDRESS
} from './constants.ts'
import type { FlashRuntime } from './schemas.ts'

type FlashProfile = 'dev' | 'prod'

export interface FlashChainConfig {
  chainId: number
  order: number
  slug: string
  profiles: readonly FlashProfile[]
  weth?: string | undefined
  usdc?: string | undefined
}

const FLASH_CHAIN_REGISTRY: readonly FlashChainConfig[] = [
  {
    chainId: 1,
    order: 0,
    slug: 'ethereum',
    profiles: ['dev', 'prod'],
    weth: FLASH_WETH_ADDRESS,
    usdc: FLASH_USDC_ADDRESS
  },
  { chainId: 10, order: 1, slug: 'optimism', profiles: ['dev', 'prod'] },
  { chainId: 56, order: 2, slug: 'bsc', profiles: ['dev', 'prod'] },
  { chainId: 137, order: 3, slug: 'polygon', profiles: ['dev', 'prod'] },
  { chainId: 999, order: 4, slug: 'hyperevm', profiles: ['dev', 'prod'] },
  {
    chainId: 8453,
    order: 5,
    slug: 'base',
    profiles: ['dev', 'prod'],
    weth: FLASH_BASE_WETH_ADDRESS,
    usdc: FLASH_BASE_USDC_ADDRESS
  },
  { chainId: 9745, order: 6, slug: 'plasma', profiles: ['dev', 'prod'] },
  { chainId: 81457, order: 7, slug: 'blast', profiles: ['dev', 'prod'] },
  { chainId: 42161, order: 8, slug: 'arbitrum', profiles: ['dev', 'prod'] },
  { chainId: 43114, order: 9, slug: 'avalanche', profiles: ['dev', 'prod'] },
  { chainId: 143, order: 10, slug: 'monad', profiles: ['dev', 'prod'] },
  {
    chainId: FLASH_ANVIL_CHAIN_ID,
    order: 11,
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
  return getFlashChainConfig(chainId)?.slug ?? ''
}

export function getFlashChainIdFromSlug(slug: string) {
  return FLASH_CHAIN_REGISTRY.find((config) => config.slug === slug.trim().toLowerCase())?.chainId
}

export function getFlashDefaultChainId(runtime: FlashRuntime = {}, availableChainIds?: readonly number[]) {
  const supported = getFlashSupportedChainIds(runtime)
  const available = (availableChainIds ?? [])
    .map(Number)
    .filter((chainId) => Number.isInteger(chainId) && supported.includes(chainId))

  if (flashProfile(runtime) === 'dev' && available.includes(FLASH_ANVIL_CHAIN_ID)) {
    return FLASH_ANVIL_CHAIN_ID
  }

  return (
    available.at(0) ??
    (flashProfile(runtime) === 'dev' ? FLASH_ANVIL_CHAIN_ID : supported.at(0)) ??
    FLASH_ANVIL_CHAIN_ID
  )
}
