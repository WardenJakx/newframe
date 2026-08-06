import { Text } from '@newframe/ui/text'

import { cva } from '../../../../../generated/styled-system/css/cva.js'
import { OrderAssetPosition } from './OrderAssetPosition'
import {
  normalizeOrderSide,
  orderAssetAmounts,
  orderContraAmount,
  orderContraNotional,
  orderPairIntent,
  orderTargetNotional
} from './orderModel'

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
  networks,
  networksMeta,
  order
}: {
  networks: Record<string | number, any>
  networksMeta: Record<string | number, any>
  order: any
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
        networks={networks}
        networksMeta={networksMeta}
        notional={orderTargetNotional(order)}
      />
      <Text decorative tone='muted' variant='heading'>
        {arrow}
      </Text>
      <OrderAssetPosition
        align='end'
        amount={orderContraAmount(order)}
        asset={order.contraAsset}
        networks={networks}
        networksMeta={networksMeta}
        notional={orderContraNotional(order)}
      />
    </div>
  )
}
