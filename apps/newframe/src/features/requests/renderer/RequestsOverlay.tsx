import { useWalletSelector } from '../../../platform/state-sync/renderer/useAppSelector'
import { useHomeUiStore } from '../../../app/renderer/tray/Home/state/HomeUiProvider'
import { RequestsOverlayView } from './RequestsOverlayView'

export function RequestsOverlay() {
  const accountId = useWalletSelector((state) => state.currentAccount || '')
  const closeOverlay = useHomeUiStore((state) => state.closeOverlay)

  return <RequestsOverlayView accountId={accountId} onBack={closeOverlay} />
}
