export const colorPrimitives = {
  'plum-500': '#28242d',
  'plum-600': '#1d1921',
  'plum-700': '#1a161c',
  'plum-800': '#18141b',
  'plum-900': '#161218',
  'plum-950': '#120e14',

  'ice-50': '#f8ffff',
  'lavender-300': '#dfdfed',

  'teal-400': '#28e1cd',
  'teal-500': '#00d2be',
  'teal-600': '#00aa78',
  'teal-700': '#005a5a',

  'red-400': '#ffb7b7',
  'red-450': '#fc615d',
  'red-500': '#ff6e78',
  'red-600': '#ff3264',
  'red-650': '#f62423',

  'yellow-400': '#f1c950',
  'yellow-500': '#fdbd41',
  'violet-500': '#866eff',
  'violet-550': '#8c61e8',
  'lime-400': '#c4f867',

  'blue-400': '#3eadf1',
  'blue-500': '#6a83ff',
  'blue-700': '#3c28ea',
  'orange-500': '#ff9933',
  'pink-500': '#ff00ae',
  'green-400': '#34c84a',
  'green-500': '#5ab5b2',
  'purple-500': '#9878dd',

  black: '#000000',
  white: '#ffffff'
} as const

export type ColorPrimitiveName = keyof typeof colorPrimitives

export type ColorReference =
  | ColorPrimitiveName
  | {
      color: ColorPrimitiveName
      alpha: number
    }

export const darkColorSemantics = {
  'bg-primary': 'plum-950',
  'bg-secondary': 'plum-900',
  'bg-card': 'plum-800',
  'bg-raised': 'plum-700',
  'bg-control': 'plum-600',
  'bg-hover': 'plum-500',

  'text-primary': 'ice-50',
  'text-secondary': { color: 'lavender-300', alpha: 0.7 },
  'text-muted': { color: 'lavender-300', alpha: 0.45 },
  'text-disabled': { color: 'lavender-300', alpha: 0.35 },
  'text-inverse': 'plum-950',

  'action-primary': 'teal-500',
  'action-primary-hover': 'teal-400',
  'action-primary-text': 'plum-950',
  'action-primary-subtle': { color: 'teal-500', alpha: 0.12 },
  'action-primary-border': { color: 'teal-500', alpha: 0.22 },
  'action-danger': 'red-500',
  'action-danger-hover': 'red-400',
  'action-danger-subtle': { color: 'red-500', alpha: 0.12 },
  'action-danger-border': { color: 'red-500', alpha: 0.22 },

  'status-success': 'teal-500',
  'status-success-subtle': { color: 'teal-500', alpha: 0.12 },
  'status-warning': 'yellow-400',
  'status-warning-subtle': { color: 'yellow-400', alpha: 0.08 },
  'status-warning-border': { color: 'yellow-400', alpha: 0.46 },
  'status-danger': 'red-500',
  'status-danger-subtle': { color: 'red-500', alpha: 0.12 },
  'status-pending': 'violet-500',
  'status-special': 'lime-400',
  'status-special-subtle': { color: 'lime-400', alpha: 0.14 },

  'border-subtle': { color: 'ice-50', alpha: 0.06 },
  'border-default': { color: 'ice-50', alpha: 0.1 },
  'border-strong': { color: 'ice-50', alpha: 0.18 },
  'border-focus': { color: 'teal-500', alpha: 0.45 },

  'shadow-subtle': { color: 'black', alpha: 0.18 },
  'shadow-default': { color: 'black', alpha: 0.28 },
  'shadow-strong': { color: 'black', alpha: 0.55 },
  scrim: { color: 'black', alpha: 0.5 },

  'overlay-start': { color: 'pink-500', alpha: 0.03 },
  'overlay-end': { color: 'teal-500', alpha: 0.03 }
} as const satisfies Record<string, ColorReference>

export type SemanticColorName = keyof typeof darkColorSemantics

export const systemColors = {
  'native-close': colorPrimitives['red-450'],
  'native-minimize': colorPrimitives['yellow-500'],
  'native-maximize': colorPrimitives['green-400'],
  'qr-foreground': colorPrimitives.black,
  'qr-background': colorPrimitives.white
} as const

export type SystemColorName = keyof typeof systemColors

export const chainColors = {
  mainnet: colorPrimitives['teal-500'],
  testnet: colorPrimitives['orange-500'],
  default: colorPrimitives['pink-500'],
  optimism: colorPrimitives['red-650'],
  gnosis: colorPrimitives['green-500'],
  polygon: colorPrimitives['violet-550'],
  arbitrum: colorPrimitives['blue-400'],
  other: colorPrimitives['blue-700']
} as const

export type ChainColorName = keyof typeof chainColors

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

function hexToRgb(hex: string) {
  const value = hex.replace('#', '')
  if (value.length !== 6) throw new Error(`Expected a six-digit hex color, received "${hex}"`)

  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16)
  }
}

function resolvePrimitiveColor(name: ColorPrimitiveName) {
  return colorPrimitives[name]
}

export function resolveSemanticColor(name: SemanticColorName) {
  const reference: ColorReference = darkColorSemantics[name]

  if (typeof reference === 'string') return resolvePrimitiveColor(reference)

  const { r, g, b } = hexToRgb(resolvePrimitiveColor(reference.color))
  return `rgba(${r}, ${g}, ${b}, ${reference.alpha})`
}

export function chainColorCssVariable(name?: string) {
  const chainColor = legacyChainColorNames[name || ''] || 'other'
  return `var(--color-chain-${chainColor})`
}

export function resolveSystemColor(name: SystemColorName) {
  return systemColors[name]
}
