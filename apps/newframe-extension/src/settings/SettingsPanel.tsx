import { Stack } from '@newframe/ui/stack'
import type { ReactNode } from 'react'

import { cva } from '../styled-system/css/cva.js'

const settingsPanelRecipe = cva({
  base: {
    position: 'relative',
    width: 'page-compact',
    maxHeight: 'page-max-block',
    overflowX: 'hidden',
    overflowY: 'auto',
    padding: '5',
    background: 'bg.secondary'
  }
})

export type SettingsPanelProps = { children: ReactNode }

export function SettingsPanel({ children }: SettingsPanelProps) {
  return (
    <main className={settingsPanelRecipe()}>
      <Stack gap='medium'>{children}</Stack>
    </main>
  )
}
