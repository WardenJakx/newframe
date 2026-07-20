import { IconButton } from '@newframe/ui/icon-button'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'

import { getContraPreposition } from '../../../../../resources/domain/flash/pair'
import { activateOnKeyboard } from '../../ui/keyboard'
import { OrderAssetPill } from './OrderAssetPill'
import {
  isOpenOrder,
  normalizeOrderSide,
  orderDate,
  orderPairIntent,
  orderSideLabel,
  orderSize,
  orderStatus,
  orderStatusLabel,
  orderTypeLabel
} from './orderModel'

export function OrdersView({
  cancelError,
  cancellingOrderId,
  networks,
  networksMeta,
  onCancel,
  onOpen,
  orders
}: {
  cancelError: { message: string; orderId: string } | null
  cancellingOrderId: string
  networks: Record<string | number, any>
  networksMeta: Record<string | number, any>
  onCancel: (order: any) => void
  onOpen: (orderId: string) => void
  orders: any[]
}) {
  if (!orders.length)
    return (
      <Text align='center' tone='disabled' variant='overline'>
        No Orders Yet
      </Text>
    )

  return (
    <div className='t2OrderList'>
      {orders.map((order) => {
        const chainId = Number(order.chainId)
        const open = isOpenOrder(order)
        const side = normalizeOrderSide(order.side)
        const statusKey = orderStatus(order).replace(/[^a-z0-9]+/g, '-') || 'unknown'
        const error = cancelError && cancelError.orderId === order.orderId ? cancelError.message : ''

        return (
          <div
            key={order.orderId}
            aria-label={`${orderPairIntent(order)} order details`}
            className='t2OrderRow cardShow'
            data-order-id={order.orderId}
            onClick={() => onOpen(order.orderId)}
            onKeyDown={(event) => activateOnKeyboard(event, () => onOpen(order.orderId))}
            role='button'
            tabIndex={0}
          >
            <div className='t2OrderCancelSlot'>
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
            </div>
            <div className='t2OrderStatusBlock'>
              <Text
                tone={statusKey === 'filled' ? 'success' : statusKey === 'failed' ? 'danger' : 'secondary'}
                variant='supporting'
              >
                {orderStatusLabel(order)}
              </Text>
              <Text tone='muted' variant='caption'>
                {orderDate(order.createdAt)}
              </Text>
            </div>
            <div className='t2OrderAssetColumn'>
              <OrderAssetPill
                asset={order.targetAsset}
                fallbackChainId={chainId}
                networks={networks}
                networksMeta={networksMeta}
              />
            </div>
            <div className='t2OrderCopy'>
              <Stack gap='xsmall' grow>
                <Text truncate variant='label'>
                  {orderPairIntent(order)}
                </Text>
                <Stack direction='row' gap='xsmall'>
                  <Text tone='muted' variant='caption'>
                    {orderSideLabel(order)}
                  </Text>
                  <Text tone='muted' variant='caption'>
                    {orderTypeLabel(order)}
                  </Text>
                  {error ? (
                    <Text tone='danger' truncate variant='caption'>
                      {error}
                    </Text>
                  ) : null}
                </Stack>
              </Stack>
            </div>
            <div className='t2OrderSize'>
              <Text variant='numeric'>{orderSize(order)}</Text>
            </div>
            <div className='t2OrderContra'>
              <OrderAssetPill
                asset={order.contraAsset}
                fallbackChainId={chainId}
                networks={networks}
                networksMeta={networksMeta}
                prefix={side ? getContraPreposition(side) : 'with'}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
