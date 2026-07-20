import { Text } from '@newframe/ui/text'

import { SidePanelHeader } from '../../../../../resources/Components/SidePanel/SidePanelHeader'
import Requests from '../../../Account/Requests'

export function RequestsOverlayView({ accountId, onBack }: { accountId: string; onBack: () => void }) {
  return (
    <div aria-label='Requests' className='t2Overlay cardShow' role='dialog'>
      <SidePanelHeader closeLabel='Back' onClose={onBack} title='Requests' />
      <div className='t2OverlayScroll t2RequestsScroll'>
        {accountId ? (
          <Requests expanded account={accountId} moduleId='requests' />
        ) : (
          <Text align='center' tone='disabled' variant='label'>
            No Pending Requests
          </Text>
        )}
      </div>
    </div>
  )
}
