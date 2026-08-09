import { Text } from '@newframe/ui/text'

import { TrayOverlay } from '../../../shared/renderer/ui/TrayOverlay'
import Requests from './Account/Requests'
import type { RequestRendererCapabilities } from './requestCapabilities'

export function RequestsOverlayView({
  accountId,
  capabilities,
  onBack
}: {
  accountId: string
  capabilities: Pick<RequestRendererCapabilities, 'panel' | 'review'>
  onBack: () => void
}) {
  return (
    <TrayOverlay closeLabel='Back' label='Requests' onClose={onBack} padding='small' title='Requests'>
      {accountId ? (
        <Requests capabilities={capabilities} expanded account={accountId} moduleId='requests' />
      ) : (
        <Text align='center' tone='disabled' variant='label'>
          No Pending Requests
        </Text>
      )}
    </TrayOverlay>
  )
}
