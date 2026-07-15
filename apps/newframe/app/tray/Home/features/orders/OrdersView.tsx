import React from 'react'

import svg from '../../../../../resources/svg'
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
  if (!orders.length) return <div className='t2EmptyState'>No Orders Yet</div>

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
                <div
                  aria-disabled={cancellingOrderId === order.orderId}
                  aria-label='Cancel order'
                  className='t2OrderCancel'
                  onClick={(event) => {
                    event.stopPropagation()
                    onCancel(order)
                  }}
                  onKeyDown={(event) => {
                    event.stopPropagation()
                    activateOnKeyboard(event, () => onCancel(order))
                  }}
                  role='button'
                  tabIndex={0}
                  title='Cancel order'
                >
                  {svg.x(9)}
                </div>
              ) : null}
            </div>
            <div className='t2OrderStatusBlock'>
              <div className={`t2OrderStatus t2OrderStatus-${statusKey}`}>{orderStatusLabel(order)}</div>
              <div className='t2OrderCreated'>{orderDate(order.createdAt)}</div>
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
              <div className='t2OrderIntent'>{orderPairIntent(order)}</div>
              <div className='t2OrderSubline'>
                <span>{orderSideLabel(order)}</span>
                <span>{orderTypeLabel(order)}</span>
                {error ? <span className='t2OrderCancelInlineError'>{error}</span> : null}
              </div>
            </div>
            <div className='t2OrderSize'>{orderSize(order)}</div>
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
