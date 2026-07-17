import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'

export type SettingsStatusProps = {
  label: string
  tone: 'success' | 'warning' | 'danger'
  value: string
}

export function SettingsStatus({ label, tone, value }: SettingsStatusProps) {
  return (
    <Surface padding='medium' radius='small' tone='card'>
      <Stack gap='xsmall'>
        <Text role='title' tone={tone}>
          {label}
        </Text>
        <Text role='heading' tone='secondary' truncate>
          {value}
        </Text>
      </Stack>
    </Surface>
  )
}
