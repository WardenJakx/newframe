import { forwardRef, type KeyboardEventHandler, type ReactNode } from 'react'

import './selection.css'

export type SelectionProps = {
  children: ReactNode
  onKeyDown?: KeyboardEventHandler<HTMLDivElement>
}

export const Selection = forwardRef<HTMLDivElement, SelectionProps>(function Selection(
  { children, onKeyDown },
  ref
) {
  return (
    <div className='nf-selection' onKeyDown={onKeyDown} ref={ref}>
      {children}
    </div>
  )
})
