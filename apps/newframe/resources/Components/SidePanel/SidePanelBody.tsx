import type { ReactNode } from 'react'

import './side-panel.css'

export type SidePanelBodyProps = {
  children: ReactNode
  footerSpace?: 'compact' | 'default'
}

export function SidePanelBody({ children, footerSpace = 'default' }: SidePanelBodyProps) {
  return <main className={`nf-side-panel__body nf-side-panel__body--${footerSpace}`}>{children}</main>
}
