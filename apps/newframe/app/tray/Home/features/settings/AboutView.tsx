import { Button } from '@newframe/ui/button'
import { Spacer } from '@newframe/ui/spacer'
import { Stack } from '@newframe/ui/stack'
import { Surface } from '@newframe/ui/surface'
import { Text } from '@newframe/ui/text'

import { TrayOverlay } from '../../../../../resources/Components/TrayOverlay'
import { SettingsActionRow } from '../../ui/SettingsRow'

export function AboutView({
  copied,
  instanceId,
  onBack,
  onCopyInstanceId,
  onViewLicense,
  version
}: {
  copied: boolean
  instanceId: string
  onBack: () => void
  onCopyInstanceId: () => void
  onViewLicense: () => void
  version: string
}) {
  return (
    <TrayOverlay closeLabel='Back' label='App Info' onClose={onBack} title='App Info'>
      <Stack gap='small'>
        <Button appearance='selectionOption' label='Copy instance ID' onPress={onCopyInstanceId} width='full'>
          <Text tone='muted' variant='supporting'>
            Instance ID
          </Text>
          <Spacer />
          <Text truncate variant='code'>
            {copied ? 'Instance ID Copied' : instanceId}
          </Text>
        </Button>
        <Surface padding='small' radius='card'>
          <Stack gap='xsmall'>
            <Text tone='muted' variant='supporting'>
              Version
            </Text>
            <Text variant='supporting'>{`v${version}`}</Text>
          </Stack>
        </Surface>
        <SettingsActionRow action='Open' label='View License' onAction={onViewLicense} />
      </Stack>
    </TrayOverlay>
  )
}
