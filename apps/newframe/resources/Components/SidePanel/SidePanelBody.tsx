import type { ReactNode } from 'react'

import { cva } from '../../styled-system/css/cva.js'

const bodyRecipe = cva({
  base: {
    position: 'relative',
    minHeight: 0,
    flex: 1,
    display: 'flex',
    overflowX: 'hidden',
    overflowY: 'auto',
    paddingInline: '6'
  },
  variants: {
    footerSpace: {
      compact: { paddingBlockEnd: 'token(sizes.panel-footer-space-compact)' },
      default: { paddingBlockEnd: 'token(sizes.panel-footer-space)' }
    }
  },
  defaultVariants: { footerSpace: 'default' }
})

export type SidePanelBodyProps = {
  children: ReactNode
  footerSpace?: 'compact' | 'default'
}

export function SidePanelBody({ children, footerSpace = 'default' }: SidePanelBodyProps) {
  return <main className={bodyRecipe({ footerSpace })}>{children}</main>
}
