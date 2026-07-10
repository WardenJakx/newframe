import type { ColorwayPalette } from '../../main/store/state'
import { chainColors, type ChainColorName } from '../style/tokens/colors'

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
