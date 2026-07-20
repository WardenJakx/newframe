import { Heading } from '@newframe/ui/heading'
import { IconButton } from '@newframe/ui/icon-button'
import type { ReactNode } from 'react'
import './side-panel.css'

export type SidePanelHeaderProps = {
  action?: ReactNode
  closeLabel: string
  onClose: () => void
  title: string
}

export function SidePanelHeader({ action, closeLabel, onClose, title }: SidePanelHeaderProps) {
  return (
    <header className='nf-side-panel__header'>
      <IconButton appearance='control' icon='chevronLeft' label={closeLabel} onPress={onClose} />
      <Heading align='center' level={1} variant='title'>
        {title}
      </Heading>
      {action ?? <span aria-hidden='true' className='nf-side-panel__header-spacer' />}
    </header>
  )
}
