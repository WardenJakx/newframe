import { Icon, type IconName } from '@newframe/ui/icon'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'

export function signerIcon(type: string): IconName {
  const signerType = (type || '').toLowerCase()

  if (signerType === 'address') return 'eye'
  if (signerType === 'ledger') return 'ledger'
  if (signerType === 'trezor') return 'trezor'
  if (signerType === 'lattice') return 'lattice'

  return 'flame'
}

export default function AccountIcon({ account }: { account?: { lastSignerType?: string } | null }) {
  return (
    <Surface padding='small' radius='pill' tone='control'>
      <Stack align='center' direction='row' gap='none' justify='center'>
        <Text display='inline' tone='accent'>
          <Icon name={signerIcon(account?.lastSignerType || '')} size='medium' />
        </Text>
      </Stack>
    </Surface>
  )
}
