import { Page } from '@newframe/ui/page'
import { Stack } from '@newframe/ui/stack'
import type { ReactNode } from 'react'

export type SettingsPanelProps = { children: ReactNode }

export function SettingsPanel({ children }: SettingsPanelProps) {
  return (
    <Page size='compact'>
      <Stack gap='medium'>{children}</Stack>
    </Page>
  )
}
