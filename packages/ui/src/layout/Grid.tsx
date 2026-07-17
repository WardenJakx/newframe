import { cva, type VariantProps } from 'class-variance-authority'
import type { ReactNode } from 'react'

import './grid.css'

const gridRecipe = cva('nf-grid', {
  variants: {
    columns: {
      one: 'nf-grid--one',
      two: 'nf-grid--two',
      three: 'nf-grid--three'
    },
    gap: {
      none: 'nf-grid--gap-none',
      small: 'nf-grid--gap-small',
      medium: 'nf-grid--gap-medium',
      large: 'nf-grid--gap-large'
    },
    responsive: {
      true: 'nf-grid--responsive',
      false: null
    }
  },
  defaultVariants: {
    columns: 'one',
    gap: 'small',
    responsive: false
  }
})

export type GridProps = VariantProps<typeof gridRecipe> & { children: ReactNode }

export function Grid({ children, columns, gap, responsive }: GridProps) {
  return <div className={gridRecipe({ columns, gap, responsive })}>{children}</div>
}
