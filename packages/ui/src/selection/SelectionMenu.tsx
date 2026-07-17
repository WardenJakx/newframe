import type { ReactNode } from 'react'

import './selection.css'

export type SelectionMenuProps = { children: ReactNode }

export function SelectionMenu({ children }: SelectionMenuProps) {
  return <div className='nf-selection__menu'>{children}</div>
}
