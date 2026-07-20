import type { ReactNode } from 'react'

import { SidePanelBody } from './SidePanelBody.js'
import { SidePanelFooter } from './SidePanelFooter.js'
import { SidePanelHeader } from './SidePanelHeader.js'
import './side-panel.css'

export type SidePanelProps = {
  children: ReactNode
  closeLabel: string
  footer?: ReactNode
  footerCompact?: boolean
  footerSpace?: 'compact' | 'default'
  onClose: () => void
  title: string
}

export function SidePanel({
  children,
  closeLabel,
  footer,
  footerCompact = false,
  footerSpace = 'default',
  onClose,
  title
}: SidePanelProps) {
  return (
    <div className='nf-side-panel'>
      <SidePanelHeader closeLabel={closeLabel} onClose={onClose} title={title} />
      <SidePanelBody footerSpace={footerSpace}>{children}</SidePanelBody>
      {footer ? <SidePanelFooter compact={footerCompact}>{footer}</SidePanelFooter> : null}
    </div>
  )
}
