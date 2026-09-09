import { Text } from '@newframe/ui/text'

import { TrayOverlay } from '../../../shared/renderer/ui/TrayOverlay'
import Requests from './Account/Requests'
import { useSafeQueue } from './SafeQueue'
import { SafeQueueView } from './SafeQueueView'
import { SafeProposalDetailsView } from './SafeProposalDetailsView'
import type { RequestRendererCapabilities } from './requestCapabilities'

export function RequestsOverlayView({
  accountId,
  capabilities,
  showRpcRequests = true,
  onBack
}: {
  accountId: string
  showRpcRequests?: boolean
  capabilities: Pick<RequestRendererCapabilities, 'panel' | 'review' | 'safe' | 'external'>
  onBack: () => void
}) {
  const safe = useSafeQueue({ accountId, capabilities })
  return (
    <TrayOverlay
      key={safe.review ? `${safe.review.deployment.chainId}:${safe.review.proposal.safeTxHash}` : 'requests'}
      closeLabel={safe.review ? 'Back to requests' : 'Back'}
      label='Requests'
      onClose={safe.review ? safe.back : onBack}
      padding='small'
      title='Requests'
    >
      {safe.review ? (
        <SafeProposalDetailsView {...safe.review} />
      ) : accountId ? (
        <>
          {safe.hasSafe ? <SafeQueueView {...safe.queue} /> : null}
          {showRpcRequests ? (
            <Requests capabilities={capabilities} expanded account={accountId} moduleId='requests' />
          ) : null}
        </>
      ) : (
        <Text align='center' tone='disabled' variant='label'>
          No Pending Requests
        </Text>
      )}
    </TrayOverlay>
  )
}
