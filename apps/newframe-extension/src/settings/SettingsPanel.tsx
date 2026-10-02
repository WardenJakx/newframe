import { Stack } from '@newframe/ui/stack'
import type { ReactNode } from 'react'

import { css } from '../styled-system/css/css.js'

const settingsPanelClass = css({
  position: 'relative',
  width: 'page-popup',
  maxHeight: 'page-max-block',
  overflowX: 'hidden',
  overflowY: 'auto',
  padding: '6',
  background: 'bg.primary'
})

export type SettingsPanelProps = { children: ReactNode }

export function SettingsPanel({ children }: SettingsPanelProps) {
  return (
    <main className={settingsPanelClass}>
      <Stack gap='medium'>{children}</Stack>
    </main>
  )
}
