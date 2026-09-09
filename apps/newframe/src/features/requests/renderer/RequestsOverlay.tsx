import { useWalletSelector } from '../../../platform/state-sync/renderer/useAppSelector'
import { RequestsOverlayView } from './RequestsOverlayView'
import type { RequestRendererCapabilities } from './requestCapabilities'

export function RequestsOverlay({
  capabilities,
  onBack
}: {
  capabilities: Pick<RequestRendererCapabilities, 'panel' | 'review' | 'safe' | 'external'>
  onBack: () => void
}) {
  const profileId = useWalletSelector((state) => state.currentProfile)
  const accountId = useWalletSelector((state) => state.currentAccount || '')
  const showRpcRequests = useWalletSelector((state) => {
    const account = state.accounts[state.currentAccount]
    return !Object.keys(account?.safe || {}).length || Object.keys(account?.requests || {}).length > 0
  })

  return (
    <RequestsOverlayView
      key={`${profileId}:${accountId}`}
      accountId={accountId}
      capabilities={capabilities}
      showRpcRequests={showRpcRequests}
      onBack={onBack}
    />
  )
}
