import type { ReactNode } from 'react'

import { cva } from '../styled-system/css/cva.js'

const scrollAreaRecipe = cva({
  base: { minHeight: 0, overflowY: 'auto' },
  variants: {
    height: {
      fill: { height: '100%', flex: 1 },
      menu: { maxHeight: 'scroll-menu' }
    }
  }
})

export type ScrollAreaProps = { children: ReactNode; height: 'fill' | 'menu' }

export function ScrollArea({ children, height }: ScrollAreaProps) {
  return <div className={scrollAreaRecipe({ height })}>{children}</div>
}
