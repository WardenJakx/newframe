import { useWalletSelector } from '../../../platform/state-sync/renderer/useAppSelector'
import { RequestsOverlayView } from './RequestsOverlayView'
import type { RequestRendererCapabilities } from './requestCapabilities'

export function RequestsOverlay({
  capabilities,
  onBack
}: {
  capabilities: Pick<RequestRendererCapabilities, 'panel' | 'review'>
  onBack: () => void
}) {
  const accountId = useWalletSelector((state) => state.currentAccount || '')

  return <RequestsOverlayView accountId={accountId} capabilities={capabilities} onBack={onBack} />
}
