import type { ReactNode } from 'react'

import { cva } from '../styled-system/css/cva.js'
import type { RecipeVariantProps } from '../styled-system/types/recipe.js'

const gridRecipe = cva({
  base: { display: 'grid', minWidth: 0 },
  variants: {
    columns: {
      one: { gridTemplateColumns: 'minmax(0, 1fr)' },
      two: { gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' },
      three: { gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }
    },
    gap: {
      none: { gap: 0 },
      small: { gap: '2' },
      medium: { gap: '4' },
      large: { gap: '6' }
    },
    responsive: {
      true: {
        gridTemplateColumns: 'repeat(auto-fit, minmax(min(token(sizes.grid-column-min), 100%), 1fr))'
      },
      false: {}
    }
  },
  defaultVariants: {
    columns: 'one',
    gap: 'small',
    responsive: false
  }
})

export type GridProps = RecipeVariantProps<typeof gridRecipe> & { children: ReactNode }

export function Grid({ children, columns, gap, responsive }: GridProps) {
  return <div className={gridRecipe({ columns, gap, responsive })}>{children}</div>
}
