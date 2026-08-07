import type { ReactNode } from 'react'

import { cva } from '../styled-system/css/cva.js'

const hoverSwapTextRecipe = cva({
  base: {
    display: 'inline-block',
    minWidth: 0,
    maxWidth: '100%',
    '& > [data-hover-swap-text="primary"]': { display: 'block' },
    '& > [data-hover-swap-text="alternate"]': { display: 'none' },
    '&:hover > [data-hover-swap-text="primary"]': { display: 'none' },
    '&:hover > [data-hover-swap-text="alternate"]': { display: 'block' }
  }
})

export type HoverSwapTextProps = {
  alternate: ReactNode
  children: ReactNode
}

export function HoverSwapText({ alternate, children }: HoverSwapTextProps) {
  return (
    <span className={hoverSwapTextRecipe()}>
      <span data-hover-swap-text='primary'>{children}</span>
      <span aria-hidden data-hover-swap-text='alternate'>
        {alternate}
      </span>
    </span>
  )
}
