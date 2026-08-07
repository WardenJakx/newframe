import { useWalletSelector } from '../../../../state/useAppSelector'
import { useHomeUiStore } from '../../state/HomeUiProvider'
import { RequestsOverlayView } from './RequestsOverlayView'

export function RequestsOverlay() {
  const accountId = useWalletSelector((state) => state.currentAccount || '')
  const closeOverlay = useHomeUiStore((state) => state.closeOverlay)

  return <RequestsOverlayView accountId={accountId} onBack={closeOverlay} />
}
