import { useState } from 'react'
import { useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'

import link from '../../../../shared/link'
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
        operations: state.operations || EMPTY_RECORD,
        orders: state.orders || EMPTY_RECORD,
        showTestnets: !!state.showTestnets
      }
    })
  )
  const selectedChainId = useHomeUiStore((state) => state.selectedChainId)
  const openOverlay = useHomeUiStore((state) => state.openOverlay)
  const [cancellation, setCancellation] = useState<{ operationId: string; orderId: string } | null>(null)
  const cancellationRef = useRef(cancellation)
  const [cancelError, setCancelError] = useState<{ message: string; orderId: string } | null>(null)
  const orders = createOrderRows({ ...shared, selectedChainId })
  const cancellationOperation = cancellation ? shared.operations[cancellation.operationId] : undefined
  const projectedCancelError =
    cancellation && cancellationOperation?.status === 'failed'
      ? {
          orderId: cancellation.orderId,
          message: cancellationOperation.error?.message || 'Cancel failed.'
        }
      : null
  const cancellingOrderId =
    cancellation &&
    (!cancellationOperation ||
      cancellationOperation.status === 'pending' ||
      (cancellationOperation.status === 'succeeded' && shared.orders[cancellation.orderId]?.cancellable))
      ? cancellation.orderId
      : ''

  useEffect(() => {
    cancellationRef.current = cancellation
  }, [cancellation])

  const cancel = (order: any) => {
    const current = cancellationRef.current
    const currentOperation = current ? shared.operations[current.operationId] : undefined
    const currentCompleted =
      currentOperation?.status === 'failed' ||
      (currentOperation?.status === 'succeeded' && !shared.orders[current?.orderId || '']?.cancellable)
    if (!order.orderId || (current && !currentCompleted)) return
    const operationId = crypto.randomUUID()
    const next = { operationId, orderId: order.orderId }
    cancellationRef.current = next
    setCancellation(next)
    setCancelError(null)
    void link
      .executeCommand({ type: 'flash.order-cancel', operationId, orderId: order.orderId })
      .then((result) => {
        if (cancellationRef.current?.operationId !== operationId || result.ok) return
        setCancelError({ orderId: order.orderId, message: result.message || 'Cancel failed.' })
        cancellationRef.current = null
        setCancellation(null)
      })
      .catch((error) => {
        if (cancellationRef.current?.operationId !== operationId) return
        setCancelError({ orderId: order.orderId, message: orderErrorMessage(error, 'Cancel failed.') })
        cancellationRef.current = null
        setCancellation(null)
      })
  }

  return (
    <OrdersView
      cancelError={projectedCancelError || cancelError}
      cancellingOrderId={cancellingOrderId}
      networks={shared.networks}
      networksMeta={shared.networksMeta}
      onCancel={cancel}
      onOpen={(orderId) => openOverlay({ type: 'order', orderId })}
      orders={orders}
    />
  )
}
