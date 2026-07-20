import { Text } from '@newframe/ui/text'

import { TrayOverlay } from '../../../../../resources/Components/TrayOverlay'
import Requests from '../../../Account/Requests'

export function RequestsOverlayView({ accountId, onBack }: { accountId: string; onBack: () => void }) {
  return (
    <TrayOverlay closeLabel='Back' label='Requests' onClose={onBack} padding='small' title='Requests'>
      {accountId ? (
        <Requests expanded account={accountId} moduleId='requests' />
      ) : (
        <Text align='center' tone='disabled' variant='label'>
          No Pending Requests
        </Text>
      )}
    </TrayOverlay>
  )
}
