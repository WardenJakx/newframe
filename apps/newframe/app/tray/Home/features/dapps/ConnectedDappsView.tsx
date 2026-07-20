import { IconButton } from '@newframe/ui/icon-button'
import { Text } from '@newframe/ui/text'

import { SidePanelHeader } from '../../../../../resources/Components/SidePanel/SidePanelHeader'

export interface ConnectedDappRow {
  id: string
  origin: string
}

export function ConnectedDappsView({
  dapps,
  onBack,
  onClear,
  onClearAll
}: {
  dapps: ConnectedDappRow[]
  onBack: () => void
  onClear: (originId: string) => void
  onClearAll: () => void
}) {
  return (
    <div aria-label='Dapps' className='t2Overlay cardShow' role='dialog'>
      <SidePanelHeader
        action={
          dapps.length ? (
            <IconButton
              appearance='control'
              icon='trash'
              label='Clear all connected websites'
              onPress={onClearAll}
              title='Clear all connected websites'
              tone='danger'
            />
          ) : undefined
        }
        closeLabel='Back'
        onClose={onBack}
        title='Dapps'
      />
      <div className='t2OverlayScroll t2DappsScroll'>
        {dapps.length === 0 ? (
          <Text align='center' tone='disabled' variant='label'>
            No Connected Websites
          </Text>
        ) : (
          dapps.map((dapp) => (
            <div key={dapp.id} className='t2DappRow'>
              <Text truncate variant='body'>
                {dapp.origin}
              </Text>
              <IconButton
                appearance='control'
                icon='trash'
                label={`Clear ${dapp.origin}`}
                onPress={() => onClear(dapp.id)}
                size='small'
                title={`Clear ${dapp.origin}`}
                tone='danger'
              />
            </div>
          ))
        )}
      </div>
    </div>
  )
}
