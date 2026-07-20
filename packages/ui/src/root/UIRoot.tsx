import type { ReactNode } from 'react'

import './root.css'
import '../styled-system/styles.css'

export type UIRootProps = {
  children: ReactNode
}

export function UIRoot({ children }: UIRootProps) {
  return <div className='nf-root'>{children}</div>
}
