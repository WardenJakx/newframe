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
    appearance: {
      plain: {
        borderColor: 'transparent',
        background: 'transparent',
        boxShadow: 'none'
      },
      raised: {}
    },
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
  defaultVariants: { appearance: 'raised', compact: false }
})

export type SidePanelFooterProps = {
  appearance?: 'plain' | 'raised'
  children: ReactNode
  compact?: boolean
}

export function SidePanelFooter({ appearance = 'raised', children, compact = false }: SidePanelFooterProps) {
  return <footer className={footerRecipe({ appearance, compact })}>{children}</footer>
}
