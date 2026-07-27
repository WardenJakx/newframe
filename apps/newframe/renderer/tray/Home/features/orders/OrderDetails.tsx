import { useShallow } from 'zustand/react/shallow'

import { useWalletSelector } from '../../../../state/useAppSelector'
import { useHomeUiStore } from '../../state/HomeUiProvider'
import { OrderDetailsView } from './OrderDetailsView'

const EMPTY_RECORD: Record<string, any> = {}

export function OrderDetails({ orderId }: { orderId: string }) {
  const shared = useWalletSelector(
    useShallow((state) => ({
      networks: state.networks?.ethereum || EMPTY_RECORD,
      networksMeta: state.networksMeta?.ethereum || EMPTY_RECORD,
      order: state.orders?.[orderId]
    }))
  )
  const closeOverlay = useHomeUiStore((state) => state.closeOverlay)
  if (!shared.order) return null

  return (
    <OrderDetailsView
      networks={shared.networks}
      networksMeta={shared.networksMeta}
      onBack={closeOverlay}
      order={shared.order}
      orderId={orderId}
    />
  )
}
