import type { ReactNode } from 'react'

import './selection.css'

export type SelectionOptionProps = {
  children: ReactNode
  highlighted?: boolean
  id: string
  onHighlight: () => void
  onSelect: () => void
  selected: boolean
}

export function SelectionOption({
  children,
  highlighted = false,
  id,
  onHighlight,
  onSelect,
  selected
}: SelectionOptionProps) {
  return (
    <button
      aria-selected={selected}
      className={`nf-selection__option${highlighted ? ' nf-selection__option--highlighted' : ''}`}
      id={id}
      onClick={onSelect}
      onMouseEnter={onHighlight}
      role='option'
      tabIndex={-1}
      type='button'
    >
      {children}
    </button>
  )
}
