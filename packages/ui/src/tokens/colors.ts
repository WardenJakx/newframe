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
  'red-500': '#ff6e78',
  'red-600': '#ff3264',
  'yellow-400': '#f1c950',
  'violet-500': '#866eff',
  'lime-400': '#c4f867',

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
  scrim: { color: 'black', alpha: 0.5 }
} as const satisfies Record<string, ColorReference>

export type SemanticColorName = keyof typeof darkColorSemantics

export const systemColors = {
  'qr-foreground': colorPrimitives.black,
  'qr-background': colorPrimitives.white
} as const

export type SystemColorName = keyof typeof systemColors

function hexToRgb(hex: string) {
  const value = hex.replace('#', '')
  if (value.length !== 6) throw new Error(`Expected a six-digit hex color, received "${hex}"`)

  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16)
  }
}

export function resolveSemanticColor(name: SemanticColorName) {
  const reference: ColorReference = darkColorSemantics[name]

  if (typeof reference === 'string') return colorPrimitives[reference]

  const { r, g, b } = hexToRgb(colorPrimitives[reference.color])
  return `rgba(${r}, ${g}, ${b}, ${reference.alpha})`
}

export function resolveSystemColor(name: SystemColorName) {
  return systemColors[name]
}
