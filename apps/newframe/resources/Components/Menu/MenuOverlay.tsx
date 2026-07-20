import { useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'

import { Heading } from '@newframe/ui/heading'
import { IconButton } from '@newframe/ui/icon-button'
import './menu.css'

export type MenuOverlayProps = {
  children: ReactNode
  closeLabel: string
  label: string
  onClose: () => void
  title: string
}

export function MenuOverlay({ children, closeLabel, label, onClose, title }: MenuOverlayProps) {
  const previousFocus = useRef<HTMLElement | null>(null)
  const overlay = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    overlay.current?.querySelector<HTMLButtonElement>('button')?.focus()
    return () => previousFocus.current?.focus()
  }, [])

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape') return
    event.preventDefault()
    onClose()
  }

  return (
    <div
      aria-label={label}
      aria-modal='true'
      className='nf-menu-overlay'
      onKeyDown={onKeyDown}
      ref={overlay}
      role='dialog'
    >
      <div className='nf-menu-overlay__header'>
        <span aria-hidden='true' className='nf-menu-overlay__spacer' />
        <span className='nf-menu-overlay__title'>
          <Heading level={2} variant='title'>
            {title}
          </Heading>
        </span>
        <IconButton appearance='control' icon='close' label={closeLabel} onPress={onClose} />
      </div>
      <div className='nf-menu-overlay__scroll'>{children}</div>
    </div>
  )
}
