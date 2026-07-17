import { Button } from '@newframe/ui/button'
import { Stack } from '@newframe/ui/stack'
import { StrongText } from '@newframe/ui/strong-text'
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
          <Text display='inline' role='supporting'>
            {currentLabel}
          </Text>
          <StrongText display='inline' role='supporting' tone={currentTone}>
            {currentValue}
          </StrongText>
        </Stack>
        <Button appearance='row' onPress={onToggle} size='small'>
          <Text display='inline' role='supporting'>
            {toggleLabel}
          </Text>
          <StrongText display='inline' role='supporting' tone={toggleTone}>
            {toggleValue}
          </StrongText>
        </Button>
      </Stack>
    </Surface>
  )
}
