import { Text } from '@newframe/ui/text'

import type { AirGapRequestReference } from '../../../platform/signing/domain/airgap'
import { TrayOverlay } from '../../../shared/renderer/ui/TrayOverlay'
import Requests from './Account/Requests'
import type { RequestRendererCapabilities } from './requestCapabilities'
import { SafeProposalDetailsView } from './SafeProposalDetailsView'
import { useSafeQueue } from './SafeQueue'
import { SafeQueueView } from './SafeQueueView'

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
