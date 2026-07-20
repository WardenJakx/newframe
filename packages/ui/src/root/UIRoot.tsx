import type { ReactNode } from 'react'

import '../styled-system/styles.css'
import { cva } from '../styled-system/css/cva.js'

const rootRecipe = cva({
  base: { position: 'relative', isolation: 'isolate', width: '100%', height: '100%' }
})

export type UIRootProps = {
  children: ReactNode
}

export function UIRoot({ children }: UIRootProps) {
  return <div className={`nf-root ${rootRecipe()}`}>{children}</div>
}
