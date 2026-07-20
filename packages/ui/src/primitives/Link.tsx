import type { ReactNode } from 'react'

import { cva } from '../styled-system/css/cva.js'
import type { RecipeVariantProps } from '../styled-system/types/recipe.js'

const linkRecipe = cva({
  base: {
    color: 'action.primary',
    textDecoration: 'none',
    _focusVisible: {
      outlineWidth: 'focus',
      outlineStyle: 'solid',
      outlineColor: 'border.focus',
      outlineOffset: 'focus-outline-offset'
    }
  },
  variants: {
    appearance: {
      inline: {},
      action: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 'panel-header'
      }
    }
  },
  defaultVariants: { appearance: 'inline' }
})

export type LinkProps = RecipeVariantProps<typeof linkRecipe> & {
  children: ReactNode
  external?: boolean
  href: string
  label?: string
  onPress?: () => void
}

export function Link({ appearance, children, external = false, href, label, onPress }: LinkProps) {
  return (
    <a
      aria-label={label}
      className={linkRecipe({ appearance })}
      href={href}
      onClick={
        onPress
          ? (event) => {
              event.preventDefault()
              onPress()
            }
          : undefined
      }
      rel={external ? 'noreferrer' : undefined}
      target={external ? '_blank' : undefined}
    >
      {children}
    </a>
  )
}
