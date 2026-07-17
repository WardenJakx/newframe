import type { ReactNode } from 'react'

import './side-panel.css'

export type SidePanelFooterProps = {
  children: ReactNode
  compact?: boolean
}

export function SidePanelFooter({ children, compact = false }: SidePanelFooterProps) {
  return (
    <footer
      className={compact ? 'nf-side-panel__footer nf-side-panel__footer--compact' : 'nf-side-panel__footer'}
    >
      {children}
    </footer>
  )
}
