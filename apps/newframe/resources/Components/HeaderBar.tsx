import type { ReactNode } from 'react'

import { cva } from '../styled-system/css/cva.js'

const headerBarRecipe = cva({
  base: {
    zIndex: 'header',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flex: 'none',
    paddingBlockStart: '7',
    paddingInline: '7'
  }
})

export type HeaderBarProps = {
  children: ReactNode
}

export function HeaderBar({ children }: HeaderBarProps) {
  return <header className={headerBarRecipe()}>{children}</header>
}
