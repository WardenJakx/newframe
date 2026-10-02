import { definePreset } from '@pandacss/dev'

import { borderTokens } from './src/tokens/borders.js'
import {
  colorPrimitives,
  darkColorSemantics,
  systemColors,
  type ColorReference
} from './src/tokens/colors.js'
import { elevationTokens } from './src/tokens/elevation.js'
import { layerTokens } from './src/tokens/layers.js'
import { motionTokens } from './src/tokens/motion.js'
import { opacityTokens } from './src/tokens/opacity.js'
import { radiusTokens } from './src/tokens/radius.js'
import { sizingTokens } from './src/tokens/sizing.js'
import { spacingTokens } from './src/tokens/spacing.js'
import { typographyTokens } from './src/tokens/typography.js'

function tokensWithPrefix(tokens: Record<string, string>, prefix: string) {
  return Object.fromEntries(
    Object.entries(tokens)
      .filter(([name]) => name.startsWith(prefix))
      .map(([name, value]) => [name.replace(prefix, ''), { value }])
  )
}

function semanticColor(reference: ColorReference) {
  if (typeof reference === 'string') {
    return { value: `{colors.${reference}}` }
  }

  return {
    value: `color-mix(in srgb, {colors.${reference.color}} ${reference.alpha * 100}%, transparent)`
  }
}

type ColorTokenGroup = { [name: string]: ColorTokenGroup | { value: string } }

function semanticColorTokens() {
  const values = {
    ...Object.fromEntries(
      Object.entries(darkColorSemantics).map(([name, reference]) => [name, semanticColor(reference)])
    ),
    ...Object.fromEntries(Object.entries(systemColors).map(([name, value]) => [name, { value }]))
  }
  const colors: ColorTokenGroup = {}
  for (const [name, token] of Object.entries(values)) {
    const parts = name.split('-')
    if (parts.at(-1) === 'default') {
      parts.pop()
    }
    let group = colors
    for (const part of parts) {
      group[part] ??= {}
      group = group[part] as ColorTokenGroup
    }
    // DEFAULT gives both a group and its nested colors the same public token names.
    group.DEFAULT = token
  }
  return colors
}

export const newframePreset = definePreset({
  name: 'newframe',
  theme: {
    extend: {
      tokens: {
        borderWidths: {
          ...tokensWithPrefix(borderTokens, 'nf-border-width-'),
          focus: { value: borderTokens['nf-focus-outline-width'] }
        },
        colors: Object.fromEntries(Object.entries(colorPrimitives).map(([name, value]) => [name, { value }])),
        durations: {
          fast: { value: motionTokens['nf-motion-fast'] },
          reduced: { value: motionTokens['nf-motion-reduced'] },
          standard: { value: motionTokens['nf-motion-standard'] }
        },
        easings: { standard: { value: motionTokens['nf-easing-standard'] } },
        fonts: {
          body: { value: typographyTokens['nf-font-family-body'] },
          mono: { value: typographyTokens['nf-font-family-mono'] }
        },
        fontSizes: tokensWithPrefix(typographyTokens, 'nf-font-size-'),
        fontWeights: tokensWithPrefix(typographyTokens, 'nf-font-weight-'),
        letterSpacings: { title: { value: typographyTokens['nf-letter-spacing-title'] } },
        lineHeights: { amount: { value: typographyTokens['nf-line-height-amount'] } },
        opacity: tokensWithPrefix(opacityTokens, 'nf-opacity-'),
        radii: tokensWithPrefix(radiusTokens, 'nf-radius-'),
        shadows: tokensWithPrefix(elevationTokens, 'nf-'),
        sizes: {
          ...tokensWithPrefix(sizingTokens, 'nf-size-'),
          'focus-outline-offset': { value: borderTokens['nf-focus-outline-offset'] },
          'focus-outline-offset-inset': { value: borderTokens['nf-focus-outline-offset-inset'] },
          'motion-distance-overlay': { value: motionTokens['nf-motion-distance-overlay'] },
          'motion-distance-hover': { value: motionTokens['nf-motion-distance-hover'] },
          'motion-rotation-half': { value: motionTokens['nf-motion-rotation-half'] }
        },
        spacing: {
          ...tokensWithPrefix(spacingTokens, 'nf-space-'),
          'focus-outline-offset': { value: borderTokens['nf-focus-outline-offset'] },
          'focus-outline-offset-inset': { value: borderTokens['nf-focus-outline-offset-inset'] },
          'selection-offset': { value: sizingTokens['nf-size-selection-offset'] },
          'selection-menu-space': { value: sizingTokens['nf-size-selection-menu-space'] }
        },
        zIndex: tokensWithPrefix(layerTokens, 'nf-layer-')
      },
      semanticTokens: { colors: semanticColorTokens() },
      keyframes: {
        overlayShow: {
          from: { opacity: 0, transform: 'translateX(calc(-1 * token(sizes.motion-distance-overlay)))' },
          to: { opacity: 1, transform: 'translateX(0)' }
        },
        spin: {
          to: { transform: 'rotate(360deg)' }
        }
      }
    }
  }
})
