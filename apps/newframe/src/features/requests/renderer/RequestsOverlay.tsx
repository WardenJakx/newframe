import type { AirGapRequestReference } from '../../../platform/signing/domain/airgap.ts'
import { useWalletSelector } from '../../../platform/state-sync/renderer/useAppSelector.tsx'
import type { RequestTrayCapabilities } from './requestCapabilities.ts'
import { RequestsOverlayView } from './RequestsOverlayView.tsx'

export function RequestsOverlay({
  capabilities,
  onBack,
  onRecoverSigner,
  onAirGapSigning
}: {
  capabilities: Pick<RequestTrayCapabilities, 'panel' | 'review' | 'safe' | 'external'>
  onBack: () => void
  onRecoverSigner?: (signerId: string) => void
  onAirGapSigning?: (reference: AirGapRequestReference) => void
}) {
  const profileId = useWalletSelector((state) => state.currentProfile)
  const accountId = useWalletSelector((state) => state.currentAccount || '')
  const showRpcRequests = useWalletSelector((state) => {
    const account = (state.accounts as Partial<typeof state.accounts>)[state.currentAccount]
    return !Object.keys(account?.safe ?? {}).length || Object.keys(account?.requests ?? {}).length > 0
  })

  return (
    <RequestsOverlayView
      key={`${profileId}:${accountId}`}
      accountId={accountId}
      capabilities={capabilities}
      showRpcRequests={showRpcRequests}
      onBack={onBack}
      onRecoverSigner={onRecoverSigner}
      onAirGapSigning={onAirGapSigning}
    />
  )
}
