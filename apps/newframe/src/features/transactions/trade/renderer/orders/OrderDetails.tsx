import { useShallow } from 'zustand/react/shallow'

import { useWalletSelector } from '../../../../../platform/state-sync/renderer/useAppSelector'
import { accountDisplayType } from '../../../../../shared/renderer/ui/signerPresentation'
import { OrderDetailsView } from './OrderDetailsView'
import type { OrdersCapability } from './ordersCapability'

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
    useShallow((state) => {
      const order = (state.orders as Partial<typeof state.orders>)[orderId]
      return {
        accountType: accountDisplayType(
          Object.values(state.accounts).find(
            (account) => account.address.toLowerCase() === order?.accountAddress.toLowerCase()
          )
        ),
        networks: state.networks.ethereum,
        networksMeta: state.networksMeta.ethereum,
        order,
        tokens: state.tokens
      }
    })
  )
  if (!shared.order) {
    return null
  }

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
