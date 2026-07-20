import { Heading } from '@newframe/ui/heading'
import { IconButton } from '@newframe/ui/icon-button'
import './side-panel.css'

export type SidePanelHeaderProps = {
  closeLabel: string
  onClose: () => void
  title: string
}

export function SidePanelHeader({ closeLabel, onClose, title }: SidePanelHeaderProps) {
  return (
    <header className='nf-side-panel__header'>
      <IconButton icon='chevronLeft' label={closeLabel} onPress={onClose} />
      <Heading align='center' level={1} variant='pageTitle'>
        {title}
      </Heading>
      <span aria-hidden='true' className='nf-side-panel__header-spacer' />
    </header>
  )
}
