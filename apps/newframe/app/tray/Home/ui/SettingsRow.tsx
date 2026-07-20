import { Button } from '@newframe/ui/button'
import { Icon } from '@newframe/ui/icon'
import { Spacer } from '@newframe/ui/spacer'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'
import { ToggleButton } from '@newframe/ui/toggle-button'

export function SettingsToggleRow({
  detail,
  label,
  on,
  onToggle
}: {
  detail?: string
  label: string
  on: boolean
  onToggle: () => void
}) {
  return (
    <Surface padding='small' radius='card'>
      <Stack align='center' direction='row' gap='small' justify='between'>
        <Stack gap='xsmall' grow>
          <Text truncate variant='label'>
            {label}
          </Text>
          {detail ? (
            <Text tone='muted' variant='caption'>
              {detail}
            </Text>
          ) : null}
        </Stack>
        <ToggleButton appearance='switch' label={label} onPress={onToggle} pressed={on} />
      </Stack>
    </Surface>
  )
}

export function SettingsSelectRow<T>({
  currentValue,
  label,
  onChange,
  options
}: {
  currentValue: T
  label: string
  onChange: (value: T) => void
  options: Array<{ text: string; value: T }>
}) {
  const index = options.findIndex((option) => option.value === currentValue)
  const current = index >= 0 ? options[index] : options[0]
  const next = options[(index + 1 + options.length) % options.length]

  return (
    <Button
      appearance='row'
      label={`${label}: ${current.text}`}
      onPress={() => onChange(next.value)}
      size='list'
      width='full'
    >
      <Text truncate variant='label'>
        {label}
      </Text>
      <Spacer />
      <Text tone='secondary' variant='code'>
        {current.text}
      </Text>
      <Icon name='arrowRight' size='small' />
    </Button>
  )
}

export function SettingsActionRow({
  action,
  danger = false,
  label,
  onAction
}: {
  action: string
  danger?: boolean
  label: string
  onAction: () => void
}) {
  return (
    <Button
      appearance='row'
      label={label}
      onPress={onAction}
      size='list'
      tone={danger ? 'danger' : 'neutral'}
      width='full'
    >
      <Text truncate variant='label'>
        {label}
      </Text>
      <Spacer />
      <Text tone={danger ? 'danger' : 'accent'} variant='code'>
        {action}
      </Text>
    </Button>
  )
}
