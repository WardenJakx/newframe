import type { ReactNode } from 'react'

import './scroll-area.css'

export type ScrollAreaProps = {
  children: ReactNode
  height?: 'menu' | 'list' | 'page'
}

export function ScrollArea({ children, height = 'list' }: ScrollAreaProps) {
  return <div className={`nf-scroll-area nf-scroll-area--${height}`}>{children}</div>
}
