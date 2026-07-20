import { definePreset } from '@pandacss/dev'

import { borderTokens } from './src/tokens/borders.js'
import {
  colorPrimitives,
  darkColorSemantics,
  systemColors,
  type SemanticColorName
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

function semanticColor(name: SemanticColorName) {
  const reference = darkColorSemantics[name]

  if (typeof reference === 'string') return { value: `{colors.${reference}}` }

  return {
    value: `color-mix(in srgb, {colors.${reference.color}} ${reference.alpha * 100}%, transparent)`
  }
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
          'selection-offset': { value: sizingTokens['nf-size-selection-offset'] }
        },
        zIndex: tokensWithPrefix(layerTokens, 'nf-layer-')
      },
      semanticTokens: {
        colors: {
          action: {
            danger: {
              DEFAULT: semanticColor('action-danger'),
              border: semanticColor('action-danger-border'),
              hover: semanticColor('action-danger-hover'),
              subtle: semanticColor('action-danger-subtle')
            },
            primary: {
              DEFAULT: semanticColor('action-primary'),
              border: semanticColor('action-primary-border'),
              hover: semanticColor('action-primary-hover'),
              subtle: semanticColor('action-primary-subtle'),
              text: semanticColor('action-primary-text')
            }
          },
          bg: {
            card: semanticColor('bg-card'),
            control: semanticColor('bg-control'),
            hover: semanticColor('bg-hover'),
            primary: semanticColor('bg-primary'),
            raised: semanticColor('bg-raised'),
            secondary: semanticColor('bg-secondary')
          },
          border: {
            DEFAULT: semanticColor('border-default'),
            focus: semanticColor('border-focus'),
            strong: semanticColor('border-strong'),
            subtle: semanticColor('border-subtle')
          },
          qr: {
            background: { value: systemColors['qr-background'] },
            foreground: { value: systemColors['qr-foreground'] }
          },
          scrim: semanticColor('scrim'),
          shadow: {
            DEFAULT: semanticColor('shadow-default'),
            strong: semanticColor('shadow-strong'),
            subtle: semanticColor('shadow-subtle')
          },
          status: {
            danger: {
              DEFAULT: semanticColor('status-danger'),
              subtle: semanticColor('status-danger-subtle')
            },
            pending: semanticColor('status-pending'),
            special: {
              DEFAULT: semanticColor('status-special'),
              subtle: semanticColor('status-special-subtle')
            },
            success: {
              DEFAULT: semanticColor('status-success'),
              subtle: semanticColor('status-success-subtle')
            },
            warning: {
              DEFAULT: semanticColor('status-warning'),
              border: semanticColor('status-warning-border'),
              subtle: semanticColor('status-warning-subtle')
            }
          },
          text: {
            disabled: semanticColor('text-disabled'),
            inverse: semanticColor('text-inverse'),
            muted: semanticColor('text-muted'),
            primary: semanticColor('text-primary'),
            secondary: semanticColor('text-secondary')
          }
        }
      },
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
