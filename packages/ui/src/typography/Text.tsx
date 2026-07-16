import { cva, type VariantProps } from 'class-variance-authority'
import type { ReactNode } from 'react'

import './text.css'

const textRecipe = cva('nf-text', {
  variants: {
    role: {
      body: 'nf-text--body',
      label: 'nf-text--label',
      detail: 'nf-text--detail',
      code: 'nf-text--code',
      title: 'nf-text--title'
    },
    tone: {
      primary: 'nf-text--primary',
      muted: 'nf-text--muted',
      danger: 'nf-text--danger'
    },
    truncate: {
      true: 'nf-text--truncate',
      false: null
    }
  },
  defaultVariants: { role: 'body', tone: 'primary', truncate: false }
})

export type TextProps = VariantProps<typeof textRecipe> & {
  children: ReactNode
}

export function Text({ children, role, tone, truncate }: TextProps) {
  return <span className={textRecipe({ role, tone, truncate })}>{children}</span>
}
