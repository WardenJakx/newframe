import { Button } from '@newframe/ui/button'
import { Icon } from '@newframe/ui/icon'
import { Image } from '@newframe/ui/image'
import { Text } from '@newframe/ui/text'

export type SettingsConnectionActionProps = {
  disabled?: boolean
  imageSource: string
  label: string
  onPress: () => void
  tone: 'success' | 'danger'
}

export function SettingsConnectionAction({
  disabled = false,
  imageSource,
  label,
  onPress,
  tone
}: SettingsConnectionActionProps) {
  return (
    <Button appearance='row' disabled={disabled} label={label} onPress={onPress} size='large'>
      <Image alt='' size='medium' source={imageSource} />
      <Text role='action' tone={tone} truncate>
        {label}
      </Text>
      <Icon name='arrowRight' size='medium' />
    </Button>
  )
}
