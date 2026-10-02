import type { ReactNode } from 'react'

import '../styled-system/styles.css'
import { css } from '../styled-system/css/css.js'

const rootClass = css({ position: 'relative', isolation: 'isolate', width: '100%', height: '100%' })

export type UIRootProps = {
  children: ReactNode
}

export function UIRoot({ children }: UIRootProps) {
  return <div className={`nf-root ${rootClass}`}>{children}</div>
}
