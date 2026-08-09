import { Text } from '@newframe/ui/text'

import { cva } from '../../../../../../generated/styled-system/css/cva.js'
import { OrderAssetPosition } from './OrderAssetPosition'
import {
  normalizeOrderSide,
  orderAssetAmounts,
  orderContraAmount,
  orderContraNotional,
  orderPairIntent,
  orderTargetNotional
} from './orderModel'
import type { OrderNetworkMap, OrderNetworkMetadataMap, OrderModel, OrderTokenCatalog } from './orderTypes'
import type { TokenImageCapability } from '../../../../../shared/renderer/capabilities'

const tradeFlowRecipe = cva({
  base: {
    display: 'grid',
    minWidth: 0,
    gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)',
    alignItems: 'center',
    columnGap: '4'
  }
})

export function OrderTradeFlow({
  assetImages,
  imageCapability,
  networks,
  networksMeta,
  order,
  tokens
}: {
  assetImages?: { contra?: string; target?: string }
  imageCapability: TokenImageCapability
  networks: OrderNetworkMap
  networksMeta: OrderNetworkMetadataMap
  order: OrderModel
  tokens: OrderTokenCatalog
}) {
  const side = normalizeOrderSide(order.side)
  const amounts = orderAssetAmounts(order)
  const arrow = side === 'buy' ? '←' : side === 'sell' ? '→' : '↔'

  return (
    <div aria-label={orderPairIntent(order)} className={tradeFlowRecipe()}>
      <OrderAssetPosition
        align='start'
        amount={amounts.target || '—'}
        asset={order.targetAsset}
        imageSource={assetImages?.target}
        imageCapability={imageCapability}
        networks={networks}
        networksMeta={networksMeta}
        notional={orderTargetNotional(order)}
        tokens={tokens}
      />
      <Text decorative tone='muted' variant='heading'>
        {arrow}
      </Text>
      <OrderAssetPosition
        align='end'
        amount={orderContraAmount(order)}
        asset={order.contraAsset}
        imageSource={assetImages?.contra}
        imageCapability={imageCapability}
        networks={networks}
        networksMeta={networksMeta}
        notional={orderContraNotional(order)}
        tokens={tokens}
      />
    </div>
  )
}
