import type { ReactNode } from 'react'

import { cva } from '../styled-system/css/cva.js'
import type { RecipeVariantProps } from '../styled-system/types/recipe.js'

const scrollAreaRecipe = cva({
  base: { minHeight: 0, overflowY: 'auto' },
  variants: {
    height: {
      fill: { height: '100%' },
      menu: { maxHeight: 'scroll-menu' },
      list: { maxHeight: 'scroll-list' },
      page: { maxHeight: 'page-max-block' }
    }
  },
  defaultVariants: { height: 'list' }
})

export type ScrollAreaProps = RecipeVariantProps<typeof scrollAreaRecipe> & { children: ReactNode }

export function ScrollArea({ children, height }: ScrollAreaProps) {
  return <div className={scrollAreaRecipe({ height })}>{children}</div>
}
