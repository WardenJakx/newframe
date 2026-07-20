import type { ReactNode } from 'react'

import { textRecipe, type TextRecipeProps } from './Text.js'

export type HeadingProps = Pick<TextRecipeProps, 'align' | 'tone' | 'truncate'> & {
  children: ReactNode
  level?: 1 | 2 | 3 | 4 | 5 | 6
  variant?: 'heading' | 'pageTitle' | 'sectionTitle' | 'title'
}

export function Heading({ align, children, level = 2, tone, truncate, variant = 'heading' }: HeadingProps) {
  const Component = `h${level}` as const

  return <Component className={textRecipe({ align, tone, truncate, variant })}>{children}</Component>
}
