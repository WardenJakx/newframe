import { cva, type VariantProps } from 'class-variance-authority'
import type { ReactNode } from 'react'

import './link.css'

const linkRecipe = cva('nf-link', {
  variants: {
    appearance: {
      inline: 'nf-link--inline',
      action: 'nf-link--action'
    }
  },
  defaultVariants: { appearance: 'inline' }
})

export type LinkProps = VariantProps<typeof linkRecipe> & {
  children: ReactNode
  external?: boolean
  href: string
  label?: string
}

export function Link({ appearance, children, external = false, href, label }: LinkProps) {
  return (
    <a
      aria-label={label}
      className={linkRecipe({ appearance })}
      href={href}
      rel={external ? 'noreferrer' : undefined}
      target={external ? '_blank' : undefined}
    >
      {children}
    </a>
  )
}
