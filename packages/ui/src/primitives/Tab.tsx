import type { ReactNode } from 'react'

import { Button } from './Button.js'

export type TabProps = {
  appearance?: 'segmented' | 'underline'
  children: ReactNode
  onSelect: () => void
  selected: boolean
}

export function Tab({ appearance = 'segmented', children, onSelect, selected }: TabProps) {
  return (
    <Button
      appearance={appearance === 'underline' ? 'underlineTab' : 'tab'}
      elementRole='tab'
      onPress={onSelect}
      selected={selected}
      size='small'
    >
      {children}
    </Button>
  )
}
