import type { ReactNode } from 'react'

import './selection.css'

export type SelectionListProps = {
  children: ReactNode
  id: string
  label: string
}

export function SelectionList({ children, id, label }: SelectionListProps) {
  return (
    <div aria-label={label} className='nf-selection__list' id={id} role='listbox'>
      {children}
    </div>
  )
}
