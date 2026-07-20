import { Stack } from '@newframe/ui/stack'
import type { ReactNode } from 'react'

import './settings-panel.css'

export type SettingsPanelProps = { children: ReactNode }

export function SettingsPanel({ children }: SettingsPanelProps) {
  return (
    <main className='settings-panel'>
      <Stack gap='medium'>{children}</Stack>
    </main>
  )
}
