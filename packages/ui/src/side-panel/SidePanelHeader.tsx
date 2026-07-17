import { Button } from '../control/Button.js'
import { Icon } from '../icon/Icon.js'
import { Text } from '../typography/Text.js'
import './side-panel.css'

export type SidePanelHeaderProps = {
  closeLabel: string
  onClose: () => void
  title: string
}

export function SidePanelHeader({ closeLabel, onClose, title }: SidePanelHeaderProps) {
  return (
    <header className='nf-side-panel__header'>
      <Button label={closeLabel} onPress={onClose} shape='circle' size='medium'>
        <Icon name='chevronLeft' size='large' />
      </Button>
      <Text align='center' role='pageTitle'>
        {title}
      </Text>
      <span aria-hidden='true' className='nf-side-panel__header-spacer' />
    </header>
  )
}
