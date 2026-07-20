import { Button } from '@newframe/ui/button'
import { Spacer } from '@newframe/ui/spacer'
import { Text } from '@newframe/ui/text'

import { SidePanelHeader } from '../../../../../resources/Components/SidePanel/SidePanelHeader'
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
    <div aria-label='App Info' className='t2Overlay cardShow' role='dialog'>
      <SidePanelHeader closeLabel='Back' onClose={onBack} title='App Info' />
      <div className='t2OverlayScroll t2SettingsScroll'>
        <div className='t2SettingsSection'>
          <Button
            appearance='selectionOption'
            label='Copy instance ID'
            onPress={onCopyInstanceId}
            width='full'
          >
            <Text tone='muted' variant='supporting'>
              Instance ID
            </Text>
            <Spacer />
            <Text truncate variant='code'>
              {copied ? 'Instance ID Copied' : instanceId}
            </Text>
          </Button>
          <div className='t2InfoRow'>
            <Text tone='muted' variant='supporting'>
              Version
            </Text>
            <Text variant='supporting'>{`v${version}`}</Text>
          </div>
          <SettingsActionRow action='Open' label='View License' onAction={onViewLicense} />
        </div>
      </div>
    </div>
  )
}
