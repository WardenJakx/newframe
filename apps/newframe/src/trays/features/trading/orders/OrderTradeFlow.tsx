import { Text } from '@newframe/ui/text'

import { cva } from '../../../../../generated/styled-system/css/cva.js'
import type { TokenImageCapability } from '../../../shared/capabilities.ts'
import { OrderAssetPosition } from './OrderAssetPosition.tsx'
import {
  normalizeOrderSide,
  orderAssetAmounts,
  orderContraAmount,
  orderContraNotional,
  orderPairIntent,
  orderTargetNotional
} from './orderModel.ts'
import type { OrderChainMap, OrderChainMetadataMap, OrderModel, OrderTokenCatalog } from './orderTypes.ts'

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
  chains,
  chainsMeta,
  order,
  tokens
}: {
  assetImages?: { contra?: string; target?: string }
  imageCapability: TokenImageCapability
  chains: OrderChainMap
  chainsMeta: OrderChainMetadataMap
  order: OrderModel
  tokens: OrderTokenCatalog
}) {
  const side = normalizeOrderSide(order.side)
  const amounts = orderAssetAmounts(order)
  let arrow = '↔'
  if (side === 'buy') {
    arrow = '←'
  } else if (side === 'sell') {
    arrow = '→'
  }

  return (
    <div aria-label={orderPairIntent(order)} className={tradeFlowRecipe()}>
      <OrderAssetPosition
        align='start'
        amount={amounts.target || '—'}
        asset={order.targetAsset}
        imageSource={assetImages?.target}
        imageCapability={imageCapability}
        chains={chains}
        chainsMeta={chainsMeta}
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
        chains={chains}
        chainsMeta={chainsMeta}
        notional={orderContraNotional(order)}
        tokens={tokens}
      />
    </div>
  )
}
