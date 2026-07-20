import { Button } from '@newframe/ui/button'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'

type SettingsModeTone = 'success' | 'warning'

export type SettingsModeProps = {
  currentLabel: string
  currentTone: SettingsModeTone
  currentValue: string
  onToggle: () => void
  toggleLabel: string
  toggleTone: SettingsModeTone
  toggleValue: string
}

export function SettingsMode({
  currentLabel,
  currentTone,
  currentValue,
  onToggle,
  toggleLabel,
  toggleTone,
  toggleValue
}: SettingsModeProps) {
  return (
    <Surface padding='small' radius='small' tone='card'>
      <Stack gap='small'>
        <Stack align='center' direction='row' gap='xsmall' justify='center'>
          <Text display='inline' variant='supporting'>
            {currentLabel}
          </Text>
          <Text as='strong' display='inline' variant='supporting' tone={currentTone}>
            {currentValue}
          </Text>
        </Stack>
        <Button appearance='row' onPress={onToggle} size='small'>
          <Text display='inline' variant='supporting'>
            {toggleLabel}
          </Text>
          <Text as='strong' display='inline' variant='supporting' tone={toggleTone}>
            {toggleValue}
          </Text>
        </Button>
      </Stack>
    </Surface>
  )
}
