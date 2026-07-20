import type { ReactNode } from 'react'

import { cva } from '../styled-system/css/cva.js'

const pageRecipe = cva({
  base: {
    position: 'relative',
    overflowX: 'hidden',
    overflowY: 'auto',
    background: 'bg.secondary'
  },
  variants: {
    size: {
      fill: { width: '100%', height: '100%' },
      compact: { width: 'page-compact', maxHeight: 'page-max-block', padding: '5' }
    }
  },
  defaultVariants: { size: 'fill' }
})

export type PageProps = { children: ReactNode; size?: 'compact' | 'fill' }

export function Page({ children, size = 'fill' }: PageProps) {
  return <main className={pageRecipe({ size })}>{children}</main>
}
