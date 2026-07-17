import { cva, type VariantProps } from 'class-variance-authority'
import type { ReactNode } from 'react'

import './stack.css'

const stackRecipe = cva('nf-stack', {
  variants: {
    direction: {
      column: 'nf-stack--column',
      row: 'nf-stack--row'
    },
    gap: {
      none: 'nf-stack--gap-none',
      xsmall: 'nf-stack--gap-xsmall',
      small: 'nf-stack--gap-small',
      medium: 'nf-stack--gap-medium',
      large: 'nf-stack--gap-large'
    },
    align: {
      start: 'nf-stack--align-start',
      center: 'nf-stack--align-center',
      end: 'nf-stack--align-end',
      stretch: 'nf-stack--align-stretch'
    },
    justify: {
      start: 'nf-stack--justify-start',
      center: 'nf-stack--justify-center',
      end: 'nf-stack--justify-end',
      between: 'nf-stack--justify-between'
    },
    grow: {
      true: 'nf-stack--grow',
      false: null
    },
    wrap: {
      true: 'nf-stack--wrap',
      false: null
    },
    equal: {
      true: 'nf-stack--equal',
      false: null
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

export type StackProps = VariantProps<typeof stackRecipe> & {
  children: ReactNode
  decorative?: boolean
}

export function Stack({
  align,
  children,
  decorative = false,
  direction,
  equal,
  gap,
  grow,
  justify,
  wrap
}: StackProps) {
  return (
    <div
      aria-hidden={decorative || undefined}
      className={stackRecipe({ align, direction, equal, gap, grow, justify, wrap })}
    >
      {children}
    </div>
  )
}
