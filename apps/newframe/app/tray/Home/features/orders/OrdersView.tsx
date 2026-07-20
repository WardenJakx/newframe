import { IconButton } from '@newframe/ui/icon-button'
import { Stack } from '@newframe/ui/stack'
import { Text } from '@newframe/ui/text'

import { getContraPreposition } from '../../../../../resources/domain/flash/pair'
import { cva } from '../../../../../resources/styled-system/css/cva.js'
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

const orderListRecipe = cva({ base: { display: 'flex', flexDirection: 'column', gap: '2' } })

const orderRowRecipe = cva({
  base: {
    minHeight: 'menu-row-min',
    display: 'grid',
    gridTemplateColumns: '22px 70px minmax(0, 1fr) minmax(62px, auto)',
    gridTemplateAreas: '"cancel status copy size" "cancel asset copy contra"',
    alignItems: 'center',
    columnGap: '4',
    rowGap: '2',
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
      asset: { gridArea: 'asset' },
      cancel: { gridArea: 'cancel', display: 'grid', placeItems: 'center' },
      contra: { gridArea: 'contra', maxWidth: 'selection-trigger', justifySelf: 'end' },
      copy: { gridArea: 'copy' },
      size: { gridArea: 'size', maxWidth: 'selection-trigger', justifySelf: 'end', overflow: 'hidden' },
      status: { gridArea: 'status' }
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
    <div className={orderListRecipe()}>
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
            className={orderRowRecipe()}
            data-order-id={order.orderId}
            onClick={() => onOpen(order.orderId)}
            onKeyDown={(event) => activateOnKeyboard(event, () => onOpen(order.orderId))}
            role='button'
            tabIndex={0}
          >
            <div className={orderAreaRecipe({ area: 'cancel' })}>
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
            <div className={orderAreaRecipe({ area: 'status' })}>
              <Stack gap='xsmall'>
                <Text
                  tone={statusKey === 'filled' ? 'success' : statusKey === 'failed' ? 'danger' : 'secondary'}
                  variant='supporting'
                >
                  {orderStatusLabel(order)}
                </Text>
                <Text tone='muted' variant='caption'>
                  {orderDate(order.createdAt)}
                </Text>
              </Stack>
            </div>
            <div className={orderAreaRecipe({ area: 'asset' })}>
              <OrderAssetPill
                asset={order.targetAsset}
                fallbackChainId={chainId}
                networks={networks}
                networksMeta={networksMeta}
              />
            </div>
            <div className={orderAreaRecipe({ area: 'copy' })}>
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
            <div className={orderAreaRecipe({ area: 'size' })}>
              <Text variant='numeric'>{orderSize(order)}</Text>
            </div>
            <div className={orderAreaRecipe({ area: 'contra' })}>
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
