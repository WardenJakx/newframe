import { Heading } from '@newframe/ui/heading'
import { IconButton } from '@newframe/ui/icon-button'
import { Inline } from '@newframe/ui/inline'
import type { ReactNode } from 'react'

import { cva } from '../../../../../generated/styled-system/css/cva.js'

const headerRecipe = cva({
  base: {
    flexShrink: 0,
    alignItems: 'center'
  },
  variants: {
    appearance: {
      panel: {
        height: 'panel-header',
        display: 'grid',
        gridTemplateColumns: 'token(sizes.icon-button-medium) minmax(0, 1fr) token(sizes.icon-button-medium)',
        paddingBlockStart: '7',
        paddingBlockEnd: '4',
        paddingInline: '8'
      },
      menu: { display: 'flex', flex: 'none', padding: '7' }
    }
  },
  defaultVariants: { appearance: 'panel' }
})

const spacerRecipe = cva({ base: { width: 'icon-button-medium', height: 'icon-button-medium' } })
const menuTitleRecipe = cva({ base: { flex: 1, textAlign: 'center', pointerEvents: 'none' } })

export type SidePanelHeaderProps = {
  action?: ReactNode
  appearance?: 'menu' | 'panel'
  closeLabel: string
  onClose: () => void
  title: string
  titleLeading?: ReactNode
}

export function SidePanelHeader({
  action,
  appearance = 'panel',
  closeLabel,
  onClose,
  title,
  titleLeading
}: SidePanelHeaderProps) {
  if (appearance === 'menu') {
    return (
      <header className={headerRecipe({ appearance })}>
        <span aria-hidden='true' className={spacerRecipe()} />
        <span className={menuTitleRecipe()}>
          <Heading level={2} variant='title'>
            {title}
          </Heading>
        </span>
        <IconButton appearance='control' icon='close' label={closeLabel} onPress={onClose} />
      </header>
    )
  }
  return (
    <header className={headerRecipe({ appearance })}>
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
