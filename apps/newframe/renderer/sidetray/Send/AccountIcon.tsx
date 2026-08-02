import { Icon } from '@newframe/ui/icon'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'
import { signerIconName } from '../../shared/signerPresentation'

export default function AccountIcon({ account }: { account?: { lastSignerType?: string } | null }) {
  return (
    <Surface padding='small' radius='pill' tone='control'>
      <Stack align='center' direction='row' gap='none' justify='center'>
        <Text display='inline' tone='accent'>
          <Icon name={signerIconName(account?.lastSignerType)} size='medium' />
        </Text>
      </Stack>
    </Surface>
  )
}
