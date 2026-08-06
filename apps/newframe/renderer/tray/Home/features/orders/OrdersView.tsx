import { IconButton } from '@newframe/ui/icon-button'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'

import { cva } from '../../../../../generated/styled-system/css/cva.js'
import { activateOnKeyboard } from '../../ui/keyboard'
import { OrderAssetIcon } from './OrderAssetPosition'
import {
  hasOrderFill,
  isOpenOrder,
  normalizeOrderSide,
  orderAssetSymbol,
  orderContraAmount,
  orderContraNotional,
  orderDate,
  orderPairIntent,
  orderSideLabel,
  orderStatus,
  orderStatusLabel,
  orderTypeLabel
} from './orderModel'

const orderListRecipe = cva({
  base: {
    display: 'flex',
    flexDirection: 'column',
    '& > [data-order-id]:not(:last-child)': {
      borderBlockEndWidth: 'thin',
      borderBlockEndStyle: 'solid',
      borderBlockEndColor: 'border.subtle'
    }
  }
})

const orderRowRecipe = cva({
  base: {
    minHeight: 'menu-row-min',
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr) auto',
    gridTemplateAreas: '"asset summary meta"',
    alignItems: 'center',
    columnGap: '4',
    padding: '4',
    borderRadius: 'small',
    cursor: 'pointer',
    _hover: { background: 'bg.card' }
  }
})

const orderAreaRecipe = cva({
  base: { minWidth: 0 },
  variants: {
    area: {
      asset: {
        gridArea: 'asset',
        display: 'flex',
        alignItems: 'center'
      },
      meta: {
        gridArea: 'meta',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        justifyContent: 'center',
        gap: '1'
      },
      summary: { gridArea: 'summary' }
    }
  }
})

export function OrdersView({
  cancelError,
  cancellingOrderId,
  networks,
  networksMeta,
  onCancel,
  onOpen,
  orders,
  tokens
}: {
  cancelError: { message: string; orderId: string } | null
  cancellingOrderId: string
  networks: Record<string | number, any>
  networksMeta: Record<string | number, any>
  onCancel: (order: any) => void
  onOpen: (orderId: string) => void
  orders: any[]
  tokens: any
}) {
  if (!orders.length)
    return (
      <Text align='center' tone='disabled' variant='overline'>
        No Orders Yet
      </Text>
    )

  return (
    <div className={orderListRecipe()}>
      {orders.map((order) => {
        const open = isOpenOrder(order)
        const side = normalizeOrderSide(order.side)
        const statusKey = orderStatus(order).replace(/[^a-z0-9]+/g, '-') || 'unknown'
        const filled = hasOrderFill(order)
        const contraAmount = orderContraAmount(order)
        const contraSymbol = orderAssetSymbol(order.contraAsset)
        const resultAmount = filled && contraAmount !== '—' ? `${contraAmount} ${contraSymbol}` : ''
        const resultNotional = filled ? orderContraNotional(order) : '—'
        const statusTone = ['filled', 'complete', 'completed'].includes(statusKey)
          ? 'success'
          : open
            ? 'secondary'
            : 'danger'
        const error = cancelError && cancelError.orderId === order.orderId ? cancelError.message : ''

        return (
          <div
            key={order.orderId}
            aria-label={`${orderPairIntent(order)} order details`}
            className={orderRowRecipe()}
            data-order-id={order.orderId}
            onClick={() => onOpen(order.orderId)}
            onKeyDown={(event) => activateOnKeyboard(event, () => onOpen(order.orderId))}
            role='button'
            tabIndex={0}
          >
            <div className={orderAreaRecipe({ area: 'asset' })}>
              <OrderAssetIcon
                asset={order.targetAsset}
                networks={networks}
                networksMeta={networksMeta}
                tokens={tokens}
              />
            </div>
            <div className={orderAreaRecipe({ area: 'summary' })}>
              <Stack gap='xsmall' grow>
                <Stack align='center' direction='row' gap='xsmall'>
                  <Text variant='label'>{orderTypeLabel(order)}</Text>
                  <Text
                    tone={side === 'buy' ? 'special' : side === 'sell' ? 'danger' : 'secondary'}
                    variant='label'
                  >
                    {orderSideLabel(order)}
                  </Text>
                </Stack>
                <Text tone='muted' variant='supporting'>
                  {orderDate(order.createdAt)}
                </Text>
                {error ? (
                  <Text tone='danger' truncate variant='caption'>
                    {error}
                  </Text>
                ) : null}
              </Stack>
            </div>
            <div className={orderAreaRecipe({ area: 'meta' })}>
              {open ? (
                <IconButton
                  disabled={cancellingOrderId === order.orderId}
                  icon='close'
                  label='Cancel order'
                  onPress={(event) => {
                    event.stopPropagation()
                    onCancel(order)
                  }}
                  size='small'
                  title='Cancel order'
                />
              ) : null}
              <Text align='end' variant='numeric'>
                {resultNotional}
              </Text>
              {resultAmount ? (
                <Text align='end' tone='muted' variant='caption' truncate>
                  {resultAmount}
                </Text>
              ) : null}
              <Text align='end' tone={statusTone} variant='supporting'>
                {orderStatusLabel(order)}
              </Text>
            </div>
          </div>
        )
      })}
    </div>
  )
}
