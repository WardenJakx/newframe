import type { ReactNode } from 'react'

import './selection.css'

export type SelectionFooterProps = { children: ReactNode }

export function SelectionFooter({ children }: SelectionFooterProps) {
  return <footer className='nf-selection__footer'>{children}</footer>
}
