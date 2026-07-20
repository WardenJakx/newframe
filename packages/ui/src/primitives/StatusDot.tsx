import { cva } from '../styled-system/css/cva.js'
import type { RecipeVariantProps } from '../styled-system/types/recipe.js'

const statusDotRecipe = cva({
  base: { borderRadius: '50%' },
  variants: {
    size: {
      small: { width: 'status-dot-small', height: 'status-dot-small' },
      medium: { width: 'status-dot-medium', height: 'status-dot-medium' }
    },
    tone: {
      accent: { background: 'action.primary' },
      success: { background: 'action.primary' },
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

export type StatusDotProps = NonNullable<RecipeVariantProps<typeof statusDotRecipe>>

export function StatusDot({ size, tone }: StatusDotProps) {
  return <span aria-hidden='true' className={statusDotRecipe({ size, tone })} data-tone={tone ?? 'accent'} />
}
