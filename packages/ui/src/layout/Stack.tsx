import { cva, type VariantProps } from 'class-variance-authority'
import type { ReactNode } from 'react'

import './stack.css'

const stackRecipe = cva('nf-stack', {
  variants: {
    gap: {
      small: 'nf-stack--gap-small',
      large: 'nf-stack--gap-large'
    }
  },
  defaultVariants: { gap: 'small' }
})

export type StackProps = VariantProps<typeof stackRecipe> & {
  children: ReactNode
}

export function Stack({ children, gap }: StackProps) {
  return <div className={stackRecipe({ gap })}>{children}</div>
}
