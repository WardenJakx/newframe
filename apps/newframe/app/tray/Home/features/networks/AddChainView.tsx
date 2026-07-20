import React from 'react'

import { Button } from '@newframe/ui/button'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'

import { SidePanelHeader } from '../../../../../resources/Components/SidePanel/SidePanelHeader'

export function AddChainView({
  onApprove,
  onReject,
  rows
}: {
  onApprove: () => void
  onReject: () => void
  rows: Array<[string, React.ReactNode]>
}) {
  return (
    <div aria-label='Add Chain' className='t2Overlay cardShow' role='dialog'>
      <SidePanelHeader closeLabel='Back' onClose={onReject} title='Add Chain' />
      <div className='t2OverlayScroll t2SettingsScroll'>
        <div className='t2SettingsSection'>
          {rows.map(([label, value]) => (
            <div className='t2InfoRow' key={label}>
              <Text tone='muted' variant='supporting'>
                {label}
              </Text>
              <Text align='end' variant='supporting'>
                {value}
              </Text>
            </div>
          ))}
          <Stack direction='row' gap='xsmall' justify='end'>
            <Button appearance='ghost' label='Reject chain' onPress={onReject} shape='pill' size='small'>
              <Text variant='compactAction'>Reject</Text>
            </Button>
            <Button appearance='primary' label='Add chain' onPress={onApprove} shape='pill' size='small'>
              <Text variant='compactAction'>Add</Text>
            </Button>
          </Stack>
        </div>
      </div>
    </div>
  )
}
