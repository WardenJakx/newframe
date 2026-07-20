import { Heading } from '@newframe/ui/heading'
import { IconButton } from '@newframe/ui/icon-button'
import { Inline } from '@newframe/ui/inline'
import type { ReactNode } from 'react'
import { cva } from '../../styled-system/css/cva.js'

const headerRecipe = cva({
  base: {
    height: 'panel-header',
    flexShrink: 0,
    display: 'grid',
    gridTemplateColumns: 'token(sizes.icon-button-medium) minmax(0, 1fr) token(sizes.icon-button-medium)',
    alignItems: 'center',
    paddingBlockStart: '7',
    paddingBlockEnd: '4',
    paddingInline: '8'
  }
})

const spacerRecipe = cva({ base: { width: 'icon-button-medium', height: 'icon-button-medium' } })

export type SidePanelHeaderProps = {
  action?: ReactNode
  closeLabel: string
  onClose: () => void
  title: string
  titleLeading?: ReactNode
}

export function SidePanelHeader({ action, closeLabel, onClose, title, titleLeading }: SidePanelHeaderProps) {
  return (
    <header className={headerRecipe()}>
      <IconButton appearance='control' icon='chevronLeft' label={closeLabel} onPress={onClose} />
      <Inline align='center' gap='xsmall' justify='center'>
        {titleLeading}
        <Heading align='center' level={1} variant='title'>
          {title}
        </Heading>
      </Inline>
      {action ?? <span aria-hidden='true' className={spacerRecipe()} />}
    </header>
  )
}
