import { useShallow } from 'zustand/react/shallow'

import type { WalletRendererState } from '../../../../../platform/state-sync/contract/projections'
import { useWalletSelector } from '../../../../../platform/state-sync/renderer/useAppSelector'
import { accountDisplayType } from '../../../../../shared/renderer/ui/signerPresentation'
import { OrderDetailsView } from './OrderDetailsView'
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
      accountType: accountDisplayType(
        Object.values(state.accounts).find(
          (account) =>
            account.address.toLowerCase() === state.orders?.[orderId]?.accountAddress?.toLowerCase()
        )
      ),
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
      accountType={shared.accountType}
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
