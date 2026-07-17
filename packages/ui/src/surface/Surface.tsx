import { cva, type VariantProps } from 'class-variance-authority'
import type { ReactNode } from 'react'

import './surface.css'

const surfaceRecipe = cva('nf-surface', {
  variants: {
    tone: {
      transparent: 'nf-surface--transparent',
      card: 'nf-surface--card',
      raised: 'nf-surface--raised',
      secondary: 'nf-surface--secondary',
      control: 'nf-surface--control',
      subtle: 'nf-surface--subtle'
    },
    padding: {
      none: 'nf-surface--padding-none',
      xsmall: 'nf-surface--padding-xsmall',
      small: 'nf-surface--padding-small',
      medium: 'nf-surface--padding-medium',
      large: 'nf-surface--padding-large'
    },
    radius: {
      none: 'nf-surface--radius-none',
      small: 'nf-surface--radius-small',
      control: 'nf-surface--radius-control',
      card: 'nf-surface--radius-card',
      pill: 'nf-surface--radius-pill'
    },
    border: {
      none: 'nf-surface--border-none',
      subtle: 'nf-surface--border-subtle',
      default: 'nf-surface--border-default',
      accent: 'nf-surface--border-accent',
      danger: 'nf-surface--border-danger',
      special: 'nf-surface--border-special'
    },
    elevation: {
      none: null,
      default: 'nf-surface--elevation-default'
    }
  },
  defaultVariants: {
    border: 'none',
    elevation: 'none',
    padding: 'medium',
    radius: 'control',
    tone: 'card'
  }
})

export type SurfaceProps = VariantProps<typeof surfaceRecipe> & { children: ReactNode }

export function Surface({ border, children, elevation, padding, radius, tone }: SurfaceProps) {
  return <div className={surfaceRecipe({ border, elevation, padding, radius, tone })}>{children}</div>
}
