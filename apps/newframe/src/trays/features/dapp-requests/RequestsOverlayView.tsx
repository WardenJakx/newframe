import type { AirGapRequestReference } from '@newframe/schema/airgap'
import { Text } from '@newframe/ui/text'

import { TrayOverlay } from '../../shared/ui/TrayOverlay.tsx'
import Requests from './Account/Requests/index.tsx'
import type { RequestRendererCapabilities } from './requestCapabilities.ts'
import { SafeProposalDetailsView } from './SafeProposalDetailsView.tsx'
import { useSafeQueue } from './SafeQueue.tsx'
import { SafeQueueView } from './SafeQueueView.tsx'

export function RequestsOverlayView({
  accountId,
  capabilities,
  showRpcRequests = true,
  onBack,
  onRecoverSigner,
  onAirGapSigning
}: {
  accountId: string
  showRpcRequests?: boolean
  capabilities: Pick<RequestRendererCapabilities, 'panel' | 'review' | 'safe' | 'external'>
  onBack: () => void
  onRecoverSigner?: (signerId: string) => void
  onAirGapSigning?: (reference: AirGapRequestReference) => void
}) {
  const safe = useSafeQueue({ accountId, capabilities, onRecoverSigner, onAirGapSigning })
  let content = (
    <Text align='center' tone='disabled' variant='label'>
      No Pending Requests
    </Text>
  )
  if (safe.review) {
    content = <SafeProposalDetailsView {...safe.review} />
  } else if (accountId) {
    content = (
      <>
        {safe.hasSafe ? <SafeQueueView {...safe.queue} /> : null}
        {showRpcRequests ? (
          <Requests capabilities={capabilities} expanded account={accountId} moduleId='requests' />
        ) : null}
      </>
    )
  }
  return (
    <TrayOverlay
      key={safe.review ? `${safe.review.deployment.chainId}:${safe.review.proposal.safeTxHash}` : 'requests'}
      closeLabel={safe.review ? 'Back to requests' : 'Back'}
      label='Requests'
      onClose={safe.review ? safe.back : onBack}
      padding='small'
      title='Requests'
    >
      {content}
    </TrayOverlay>
  )
}
