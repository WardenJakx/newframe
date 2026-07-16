import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import link from '../../../../../resources/link'
import { useWalletSelector } from '../../../../state/useAppSelector'
import { useHomeUiStore } from '../../state/HomeUiProvider'
import { createOrderRows, orderErrorMessage } from './orderModel'
import { OrdersView } from './OrdersView'

const EMPTY_RECORD: Record<string, any> = {}

export function Orders() {
  const shared = useWalletSelector(
    useShallow((state) => {
      const account = state.accounts?.[state.currentAccount]
      return {
        accountAddress: account?.address || '',
        networks: state.networks?.ethereum || EMPTY_RECORD,
        networksMeta: state.networksMeta?.ethereum || EMPTY_RECORD,
        orders: state.orders || EMPTY_RECORD,
        showTestnets: !!state.showTestnets
      }
    })
  )
  const selectedChainId = useHomeUiStore((state) => state.selectedChainId)
  const openOverlay = useHomeUiStore((state) => state.openOverlay)
  const [cancellingOrderId, setCancellingOrderId] = useState('')
  const [cancelError, setCancelError] = useState<{ message: string; orderId: string } | null>(null)
  const orders = createOrderRows({ ...shared, selectedChainId })

  const cancel = async (order: any) => {
    if (!order.orderId || cancellingOrderId) return
    setCancellingOrderId(order.orderId)
    setCancelError(null)
    try {
      const result = await link.executeCommand({ type: 'flash.order-cancel', orderId: order.orderId })
      if (!result.ok) throw new Error(result.message || 'Cancel failed.')
    } catch (error) {
      setCancelError({ orderId: order.orderId, message: orderErrorMessage(error, 'Cancel failed.') })
    } finally {
      setCancellingOrderId('')
    }
  }

  return (
    <OrdersView
      cancelError={cancelError}
      cancellingOrderId={cancellingOrderId}
      networks={shared.networks}
      networksMeta={shared.networksMeta}
      onCancel={(order) => void cancel(order)}
      onOpen={(orderId) => openOverlay({ type: 'order', orderId })}
      orders={orders}
    />
  )
}
