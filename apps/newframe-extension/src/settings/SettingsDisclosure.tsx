import { Button } from '@newframe/ui/button'
import { Icon } from '@newframe/ui/icon'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'

export type SettingsDisclosureProps = {
  description: string
  expanded: boolean
  onPress: () => void
  title: string | number
}

export function SettingsDisclosure({ description, expanded, onPress, title }: SettingsDisclosureProps) {
  return (
    <Button appearance='row' expanded={expanded} onPress={onPress} size='large'>
      <Stack gap='xsmall' grow>
        <Text role='heading' truncate>
          {title}
        </Text>
        <Text role='supporting' tone='secondary'>
          {description}
        </Text>
      </Stack>
      <Icon name='chevronUp' size='medium' />
    </Button>
  )
}
