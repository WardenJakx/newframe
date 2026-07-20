import type { ReactNode } from 'react'

import { cva } from '../styled-system/css/cva.js'
import type { RecipeVariantProps } from '../styled-system/types/recipe.js'

const surfaceRecipe = cva({
  base: { minWidth: 0 },
  variants: {
    tone: {
      transparent: { background: 'transparent' },
      card: { background: 'bg.card' },
      raised: { background: 'bg.raised' },
      secondary: { background: 'bg.secondary' },
      control: { background: 'bg.control' },
      subtle: { background: 'border.subtle' }
    },
    padding: {
      none: { padding: 0 },
      xsmall: { padding: '2' },
      small: { padding: '4' },
      medium: { padding: '6' },
      large: { padding: '7' }
    },
    radius: {
      none: { borderRadius: 0 },
      small: { borderRadius: 'small' },
      control: { borderRadius: 'control' },
      card: { borderRadius: 'card' },
      pill: { borderRadius: 'pill' }
    },
    border: {
      none: { border: 0 },
      subtle: { borderWidth: 'thin', borderStyle: 'solid', borderColor: 'border.subtle' },
      default: { borderWidth: 'thin', borderStyle: 'solid', borderColor: 'border' },
      accent: { borderWidth: 'thin', borderStyle: 'solid', borderColor: 'action.primary' },
      danger: { borderWidth: 'thin', borderStyle: 'solid', borderColor: 'status.danger' },
      special: { borderWidth: 'thin', borderStyle: 'solid', borderColor: 'status.special' }
    },
    elevation: {
      none: {},
      default: { boxShadow: 'elevation-raised' }
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

export type SurfaceProps = RecipeVariantProps<typeof surfaceRecipe> & { children: ReactNode }

export function Surface({ border, children, elevation, padding, radius, tone }: SurfaceProps) {
  return <div className={surfaceRecipe({ border, elevation, padding, radius, tone })}>{children}</div>
}
