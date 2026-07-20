import type { ReactNode } from 'react'

import { Button } from './Button.js'

export type TabProps = {
  children: ReactNode
  onSelect: () => void
  selected: boolean
}

export function Tab({ children, onSelect, selected }: TabProps) {
  return (
    <Button appearance='tab' elementRole='tab' onPress={onSelect} selected={selected} size='small'>
      {children}
    </Button>
  )
}
