import type { ReactNode } from 'react'

import { cva } from '../../styled-system/css/cva.js'

const footerRecipe = cva({
  base: {
    position: 'absolute',
    insetInline: '6',
    insetBlockEnd: '6',
    minHeight: 'panel-footer',
    zIndex: 'header',
    display: 'flex',
    alignItems: 'center',
    padding: '4',
    borderWidth: 'thin',
    borderStyle: 'solid',
    borderColor: 'border.subtle',
    borderRadius: 'default',
    background: 'bg.raised',
    boxShadow: 'elevation-raised'
  },
  variants: {
    compact: {
      true: {
        insetInlineEnd: 'auto',
        insetInlineStart: '50%',
        width: 'panel-footer-width-compact',
        minHeight: 'panel-footer-compact',
        borderRadius: 'pill',
        transform: 'translateX(-50%)'
      },
      false: {}
    }
  },
  defaultVariants: { compact: false }
})

export type SidePanelFooterProps = {
  children: ReactNode
  compact?: boolean
}

export function SidePanelFooter({ children, compact = false }: SidePanelFooterProps) {
  return <footer className={footerRecipe({ compact })}>{children}</footer>
}
