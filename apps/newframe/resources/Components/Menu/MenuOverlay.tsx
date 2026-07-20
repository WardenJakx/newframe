import { useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'

import { Heading } from '@newframe/ui/heading'
import { IconButton } from '@newframe/ui/icon-button'
import { cva } from '../../styled-system/css/cva.js'

const overlayRecipe = cva({
  base: {
    position: 'absolute',
    inset: 0,
    zIndex: 'overlay',
    display: 'flex',
    flexDirection: 'column',
    padding: '8',
    background: 'bg.primary',
    animationName: 'overlayShow',
    animationDuration: 'fast',
    animationTimingFunction: 'linear',
    animationFillMode: 'both',
    _motionReduce: { animationDuration: 'reduced' }
  }
})

const headerRecipe = cva({
  base: { display: 'flex', alignItems: 'center', flex: 'none', padding: '7' }
})

const titleRecipe = cva({ base: { flex: 1, textAlign: 'center', pointerEvents: 'none' } })
const spacerRecipe = cva({ base: { width: 'icon-button-medium' } })
const scrollRecipe = cva({
  base: { flex: 1, overflowX: 'hidden', overflowY: 'auto', paddingBlockStart: '1', paddingBlockEnd: '10' }
})

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
      className={overlayRecipe()}
      onKeyDown={onKeyDown}
      ref={overlay}
      role='dialog'
    >
      <div className={headerRecipe()}>
        <span aria-hidden='true' className={spacerRecipe()} />
        <span className={titleRecipe()}>
          <Heading level={2} variant='title'>
            {title}
          </Heading>
        </span>
        <IconButton appearance='control' icon='close' label={closeLabel} onPress={onClose} />
      </div>
      <div className={scrollRecipe()}>{children}</div>
    </div>
  )
}
