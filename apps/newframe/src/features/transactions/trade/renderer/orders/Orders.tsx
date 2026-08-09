import { useState } from 'react'
import { useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'

import link from '../../../../../platform/ipc/renderer/link'
import { useWalletSelector } from '../../../../../platform/state-sync/renderer/useAppSelector'
import { useHomeUiStore } from '../../../../../app/renderer/tray/Home/state/HomeUiProvider'
import { createOrderRows, orderErrorMessage } from './orderModel'
import { resolveOrderAssetImageSource } from './OrderAssetPosition'
import { OrdersView } from './OrdersView'

const EMPTY_RECORD: Record<string, any> = {}
type CancellationByOrder = Record<string, string>
type CancelErrorsByOrder = Record<string, string>

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
        tokens: state.tokens || { byId: {}, accountTokenIds: {} },
        showTestnets: !!state.showTestnets
      }
    })
  )
  const selectedChainId = useHomeUiStore((state) => state.selectedChainId)
  const openOverlay = useHomeUiStore((state) => state.openOverlay)
  const [cancellations, setCancellations] = useState<CancellationByOrder>({})
  const cancellationsRef = useRef(cancellations)
  const [cancelErrors, setCancelErrors] = useState<CancelErrorsByOrder>({})
  const orders = createOrderRows({ ...shared, selectedChainId })
  const projectedCancelErrors = { ...cancelErrors }
  const cancellingOrderIds = new Set<string>()

  Object.entries(cancellations).forEach(([orderId, operationId]) => {
    const operation = shared.operations[operationId]
    if (!operation || operation.status === 'pending') cancellingOrderIds.add(orderId)
    if (operation?.status === 'failed') {
      projectedCancelErrors[orderId] = operation.error?.message || 'Cancel failed.'
    }
  })

  useEffect(() => {
    const terminal = Object.entries(cancellations).filter(([, operationId]) => {
      const status = shared.operations[operationId]?.status
      return status === 'failed' || status === 'succeeded'
    })
    if (!terminal.length) return

    const next = { ...cancellationsRef.current }
    const failures: CancelErrorsByOrder = {}
    let changed = false

    terminal.forEach(([orderId, operationId]) => {
      if (next[orderId] !== operationId) return
      const operation = shared.operations[operationId]
      if (operation?.status === 'failed') {
        failures[orderId] = operation.error?.message || 'Cancel failed.'
      }
      delete next[orderId]
      changed = true
    })

    if (changed) {
      cancellationsRef.current = next
      setCancellations(next)
    }
    if (Object.keys(failures).length) {
      setCancelErrors((current) => ({ ...current, ...failures }))
    }
  }, [cancellations, shared.operations])

  const cancel = (order: any) => {
    if (!order.orderId) return
    const currentOperationId = cancellationsRef.current[order.orderId]
    const currentOperation = currentOperationId ? shared.operations[currentOperationId] : undefined
    if (currentOperationId && (!currentOperation || currentOperation.status === 'pending')) return

    const operationId = crypto.randomUUID()
    const next = { ...cancellationsRef.current, [order.orderId]: operationId }
    cancellationsRef.current = next
    setCancellations(next)
    setCancelErrors((current) => {
      if (!(order.orderId in current)) return current
      const remaining = { ...current }
      delete remaining[order.orderId]
      return remaining
    })
    void link
      .executeCommand({ type: 'flash.order-cancel', operationId, orderId: order.orderId })
      .then((result) => {
        if (cancellationsRef.current[order.orderId] !== operationId || result.ok) return
        const remaining = { ...cancellationsRef.current }
        delete remaining[order.orderId]
        cancellationsRef.current = remaining
        setCancellations(remaining)
        setCancelErrors((current) => ({
          ...current,
          [order.orderId]: result.message || 'Cancel failed.'
        }))
      })
      .catch((error) => {
        if (cancellationsRef.current[order.orderId] !== operationId) return
        const remaining = { ...cancellationsRef.current }
        delete remaining[order.orderId]
        cancellationsRef.current = remaining
        setCancellations(remaining)
        setCancelErrors((current) => ({
          ...current,
          [order.orderId]: orderErrorMessage(error, 'Cancel failed.')
        }))
      })
  }

  return (
    <OrdersView
      cancelErrors={projectedCancelErrors}
      cancellingOrderIds={cancellingOrderIds}
      networks={shared.networks}
      networksMeta={shared.networksMeta}
      onCancel={cancel}
      onOpen={(order) =>
        openOverlay({
          type: 'order',
          orderId: order.orderId,
          assetImages: {
            target: resolveOrderAssetImageSource({
              asset: order.targetAsset,
              networksMeta: shared.networksMeta,
              tokens: shared.tokens
            }),
            contra: resolveOrderAssetImageSource({
              asset: order.contraAsset,
              networksMeta: shared.networksMeta,
              tokens: shared.tokens
            })
          }
        })
      }
      orders={orders}
      tokens={shared.tokens}
    />
  )
}
