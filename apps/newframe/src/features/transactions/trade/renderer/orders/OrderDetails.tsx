import { useShallow } from 'zustand/react/shallow'

import { useWalletSelector } from '../../../../../platform/state-sync/renderer/useAppSelector'
import { OrderDetailsView } from './OrderDetailsView'
import type { WalletRendererState } from '../../../../../platform/state-sync/contract/projections'
import type { OrdersCapability } from './ordersCapability'

const EMPTY_NETWORKS: WalletRendererState['networks']['ethereum'] = {}
const EMPTY_NETWORK_METADATA: WalletRendererState['networksMeta']['ethereum'] = {}

export function OrderDetails({
  assetImages,
  capability,
  onBack,
  orderId
}: {
  assetImages?: { contra?: string; target?: string }
  capability: Pick<OrdersCapability, 'hydrateTokenImage'>
  onBack: () => void
  orderId: string
}) {
  const shared = useWalletSelector(
    useShallow((state) => ({
      networks: state.networks?.ethereum || EMPTY_NETWORKS,
      networksMeta: state.networksMeta?.ethereum || EMPTY_NETWORK_METADATA,
      order: state.orders?.[orderId],
      tokens: state.tokens || { byId: {}, accountTokenIds: {} }
    }))
  )
  if (!shared.order) return null

  return (
    <OrderDetailsView
      assetImages={assetImages}
      imageCapability={capability}
      networks={shared.networks}
      networksMeta={shared.networksMeta}
      onBack={onBack}
      order={shared.order}
      orderId={orderId}
      tokens={shared.tokens}
    />
  )
}
