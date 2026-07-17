import type { ReactNode } from 'react'

import './selection.css'

export type SelectionTriggerProps = {
  activeDescendant?: string
  children: ReactNode
  controls?: string
  disabled?: boolean
  expanded: boolean
  label: string
  onPress: () => void
  placeholder?: boolean
}

export function SelectionTrigger({
  activeDescendant,
  children,
  controls,
  disabled,
  expanded,
  label,
  onPress,
  placeholder = false
}: SelectionTriggerProps) {
  return (
    <button
      aria-activedescendant={activeDescendant}
      aria-controls={controls}
      aria-expanded={expanded}
      aria-haspopup='listbox'
      aria-label={label}
      className={`nf-selection__trigger${placeholder ? ' nf-selection__trigger--placeholder' : ''}`}
      disabled={disabled}
      onClick={onPress}
      type='button'
    >
      {children}
    </button>
  )
}
