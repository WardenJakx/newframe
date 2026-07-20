import type { ReactNode } from 'react'

import { cva } from '../styled-system/css/cva.js'
import type { RecipeVariantProps } from '../styled-system/types/recipe.js'

const stackRecipe = cva({
  base: { display: 'flex', minWidth: 0 },
  variants: {
    direction: {
      column: { flexDirection: 'column' },
      row: { flexDirection: 'row' }
    },
    gap: {
      none: { gap: 0 },
      xsmall: { gap: '2' },
      small: { gap: '4' },
      medium: { gap: '6' },
      large: { gap: '9' }
    },
    align: {
      start: { alignItems: 'flex-start' },
      center: { alignItems: 'center' },
      end: { alignItems: 'flex-end' },
      stretch: { alignItems: 'stretch' }
    },
    justify: {
      start: { justifyContent: 'flex-start' },
      center: { justifyContent: 'center' },
      end: { justifyContent: 'flex-end' },
      between: { justifyContent: 'space-between' }
    },
    grow: {
      true: { flex: 1 },
      false: {}
    },
    wrap: {
      true: { flexWrap: 'wrap' },
      false: {}
    },
    equal: {
      true: { '& > *': { flex: '1 1 0', minWidth: 0 } },
      false: {}
    }
  },
  defaultVariants: {
    align: 'stretch',
    direction: 'column',
    equal: false,
    gap: 'small',
    grow: false,
    justify: 'start',
    wrap: false
  }
})

export type StackProps = RecipeVariantProps<typeof stackRecipe> & {
  children: ReactNode
  decorative?: boolean
  element?: 'div' | 'section'
}

export function Stack({
  align,
  children,
  decorative = false,
  direction,
  element = 'div',
  equal,
  gap,
  grow,
  justify,
  wrap
}: StackProps) {
  const Component = element
  return (
    <Component
      aria-hidden={decorative || undefined}
      className={stackRecipe({ align, direction, equal, gap, grow, justify, wrap })}
    >
      {children}
    </Component>
  )
}
