import type { CSSProperties } from 'react'

import { cva } from '../styled-system/css/cva.js'
import type { RecipeVariantProps } from '../styled-system/types/recipe.js'

const statusDotRecipe = cva({
  base: { display: 'block', flexShrink: 0, borderRadius: '50%' },
  variants: {
    size: {
      fill: { width: '100%', height: '100%' },
      small: { width: 'status-dot-small', height: 'status-dot-small' },
      medium: { width: 'status-dot-medium', height: 'status-dot-medium' }
    },
    tone: {
      custom: { background: 'var(--chain-dot-color)' },
      accent: { background: 'action.primary' },
      success: { background: 'status.success' },
      danger: { background: 'status.danger' },
      warning: { background: 'status.warning' },
      neutral: {
        borderWidth: 'thin',
        borderStyle: 'solid',
        borderColor: 'border',
        background: 'bg.secondary'
      }
    }
  },
  defaultVariants: { size: 'medium', tone: 'accent' }
})

export type StatusDotProps = Omit<NonNullable<RecipeVariantProps<typeof statusDotRecipe>>, 'tone'> & {
  color?: string
  tone?: Exclude<NonNullable<RecipeVariantProps<typeof statusDotRecipe>>['tone'], 'custom'>
}

export function StatusDot({ color, size, tone }: StatusDotProps) {
  const resolvedTone = color ? 'custom' : tone
  return (
    <span
      aria-hidden='true'
      className={statusDotRecipe({ size, tone: resolvedTone })}
      data-tone={resolvedTone ?? 'accent'}
      style={color ? ({ '--chain-dot-color': color } as CSSProperties) : undefined}
    />
  )
}
