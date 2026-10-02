import { css } from '../styled-system/css/css.js'
import { cva } from '../styled-system/css/cva.js'
import type { RecipeVariantProps } from '../styled-system/types/recipe.js'

const rangeFrameClass = css({ display: 'flex', paddingBlockStart: '1' })

const rangeRecipe = cva({
  base: {
    width: '100%',
    height: 'range',
    padding: 0,
    cursor: 'pointer'
  },
  variants: {
    tone: {
      accent: { accentColor: 'action.primary' },
      danger: { accentColor: 'status.danger' },
      special: { accentColor: 'status.special' }
    }
  },
  defaultVariants: { tone: 'accent' }
})

export type RangeProps = RecipeVariantProps<typeof rangeRecipe> & {
  label: string
  max: number
  min: number
  onValueChange: (value: number) => void
  step?: number
  value: number
}

export function Range({ label, max, min, onValueChange, step, tone, value }: RangeProps) {
  return (
    <div className={rangeFrameClass}>
      <input
        aria-label={label}
        className={rangeRecipe({ tone })}
        data-tone={tone ?? 'accent'}
        max={max}
        min={min}
        onChange={(event) => onValueChange(event.currentTarget.valueAsNumber)}
        step={step}
        type='range'
        value={value}
      />
    </div>
  )
}
