import type { ReactNode } from 'react'

import './header-bar.css'

export type HeaderBarProps = {
  children: ReactNode
}

export function HeaderBar({ children }: HeaderBarProps) {
  return <header className='nf-header-bar'>{children}</header>
}
