import type { ReactNode } from 'react'

import './side-panel.css'

export type SidePanelProps = { children: ReactNode }

export function SidePanel({ children }: SidePanelProps) {
  return <div className='nf-side-panel'>{children}</div>
}
