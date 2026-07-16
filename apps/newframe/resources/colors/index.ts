import type { ColorwayPalette } from '../../main/store/state'

export const chainColors = {
  mainnet: '#00d2be',
  testnet: '#ff9933',
  default: '#ff00ae',
  optimism: '#f62423',
  gnosis: '#5ab5b2',
  polygon: '#8c61e8',
  arbitrum: '#3eadf1',
  other: '#3c28ea'
} as const

export type ChainColorName = keyof typeof chainColors

const accentChainMap: Record<keyof ColorwayPalette, ChainColorName> = {
  accent1: 'mainnet',
  accent2: 'testnet',
  accent3: 'default',
  accent4: 'optimism',
  accent5: 'gnosis',
  accent6: 'polygon',
  accent7: 'arbitrum',
  accent8: 'other'
}

function toRgb(hex: string) {
  const value = hex.replace('#', '')
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16)
  }
}

export function getColor(key: keyof ColorwayPalette) {
  const hex = chainColors[accentChainMap[key]]
  const color = toRgb(hex)

  return { ...color, hex }
}

const legacyChainColorNames: Record<string, ChainColorName> = {
  accent1: 'mainnet',
  accent2: 'testnet',
  accent3: 'default',
  accent4: 'optimism',
  accent5: 'gnosis',
  accent6: 'polygon',
  accent7: 'arbitrum',
  accent8: 'other'
}

export function chainColorValue(name?: string) {
  if (name?.startsWith('var(') || name?.startsWith('#') || name?.startsWith('rgb')) return name

  return chainColors[legacyChainColorNames[name || ''] || 'other']
}
