import { useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'

import { cva } from '../../../../../../generated/styled-system/css/cva.js'
import { SidePanelHeader } from '../../../../../shared/renderer/ui/SidePanel/SidePanelHeader'
import { TrayOverlayFrame } from '../../../../../shared/renderer/ui/TrayOverlayFrame'

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
  const overlay = useRef<HTMLElement | null>(null)

  useLayoutEffect(() => {
    if (overlay.current?.closest('[data-overlay-focus-managed]')) {
      return
    }
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    overlay.current?.querySelector<HTMLButtonElement>('button')?.focus()
    return () => previousFocus.current?.focus()
  }, [])

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.defaultPrevented || event.key !== 'Escape') {
      return
    }
    event.preventDefault()
    onClose()
  }

  return (
    <TrayOverlayFrame label={label} layout='menu' modal onKeyDown={onKeyDown} ref={overlay}>
      <SidePanelHeader appearance='menu' closeLabel={closeLabel} onClose={onClose} title={title} />
      <div className={scrollRecipe()}>{children}</div>
    </TrayOverlayFrame>
  )
}
