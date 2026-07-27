import {
  FLASH_ANVIL_CHAIN_ID,
  FLASH_BASE_CHAIN_ID,
  FLASH_BASE_USDC_ADDRESS,
  FLASH_BASE_WETH_ADDRESS,
  FLASH_USDC_ADDRESS,
  FLASH_WETH_ADDRESS
} from './constants'
import type { FlashRuntime } from './schemas'

type FlashProfile = 'dev' | 'prod'

interface FlashChainConfig {
  chainId: number
  slug: string
  profiles: readonly FlashProfile[]
  weth?: string
  usdc?: string
}

const FLASH_CHAIN_REGISTRY: readonly FlashChainConfig[] = [
  { chainId: 1, slug: 'ethereum', profiles: ['prod'], weth: FLASH_WETH_ADDRESS, usdc: FLASH_USDC_ADDRESS },
  { chainId: 10, slug: 'optimism', profiles: ['prod'] },
  { chainId: 56, slug: 'bsc', profiles: ['prod'] },
  { chainId: 137, slug: 'polygon', profiles: ['prod'] },
  { chainId: 999, slug: 'hyperevm', profiles: ['prod'] },
  {
    chainId: FLASH_BASE_CHAIN_ID,
    slug: 'base',
    profiles: ['prod'],
    weth: FLASH_BASE_WETH_ADDRESS,
    usdc: FLASH_BASE_USDC_ADDRESS
  },
  { chainId: 9745, slug: 'plasma', profiles: ['prod'] },
  { chainId: 81457, slug: 'blast', profiles: ['prod'] },
  { chainId: 42161, slug: 'arbitrum', profiles: ['prod'] },
  { chainId: 43114, slug: 'avalanche', profiles: ['prod'] },
  { chainId: 143, slug: 'monad', profiles: ['prod'] },
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
  const normalized = slug.trim().toLowerCase()
  const entry = FLASH_CHAIN_REGISTRY.find((config) => config.slug === normalized)

  return entry?.chainId
}

export function getFlashDefaultChainId(runtime: FlashRuntime = {}, availableChainIds?: readonly number[]) {
  const supported = getFlashSupportedChainIds(runtime)
  const available = (availableChainIds || [])
    .map((chainId) => Number(chainId))
    .filter((chainId) => Number.isInteger(chainId) && supported.includes(chainId))

  return available[0] || supported[0] || FLASH_ANVIL_CHAIN_ID
}
