import { useShallow } from 'zustand/react/shallow'

import { useWalletSelector } from '../../../../../platform/state-sync/renderer/useAppSelector'
import { useHomeUiStore } from '../../../../../app/renderer/tray/Home/state/HomeUiProvider'
import { OrderDetailsView } from './OrderDetailsView'

const EMPTY_RECORD: Record<string, any> = {}

export function OrderDetails({
  assetImages,
  orderId
}: {
  assetImages?: { contra?: string; target?: string }
  orderId: string
}) {
  const shared = useWalletSelector(
    useShallow((state) => ({
      networks: state.networks?.ethereum || EMPTY_RECORD,
      networksMeta: state.networksMeta?.ethereum || EMPTY_RECORD,
      order: state.orders?.[orderId],
      tokens: state.tokens || { byId: {}, accountTokenIds: {} }
    }))
  )
  const closeOverlay = useHomeUiStore((state) => state.closeOverlay)
  if (!shared.order) return null

  return (
    <OrderDetailsView
      assetImages={assetImages}
      networks={shared.networks}
      networksMeta={shared.networksMeta}
      onBack={closeOverlay}
      order={shared.order}
      orderId={orderId}
      tokens={shared.tokens}
    />
  )
}
