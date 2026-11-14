import type { ReactNode } from 'react'

import '../styled-system/styles.css'
import { css } from '../styled-system/css/css.js'

const rootClass = css({ position: 'relative', isolation: 'isolate', width: '100%', height: '100%' })
const announcerClass = css({ srOnly: true })

// Speaks transient feedback ("Copied") that has no visible, persistent text to announce.
export function announce(message: string) {
  const region = document.querySelector('[data-nf-announcer]')
  if (!region) {
    return
  }
  // Clear first so repeating the same message is announced again.
  region.textContent = ''
  requestAnimationFrame(() => {
    region.textContent = message
  })
}

export type UIRootProps = {
  children: ReactNode
}

export function UIRoot({ children }: UIRootProps) {
  return (
    <div className={`nf-root ${rootClass}`}>
      {children}
      <div aria-live='polite' className={announcerClass} data-nf-announcer role='status' />
    </div>
  )
}
