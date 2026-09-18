import { useState } from 'react'
import { useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { useWalletSelector } from '../../../../../platform/state-sync/renderer/useAppSelector'
import { resolveOrderAssetImageSource } from './OrderAssetPosition'
import { createOrderRows, orderErrorMessage } from './orderModel'
import type { OrdersCapability } from './ordersCapability'
import { OrdersView } from './OrdersView'
import type { OrderRow } from './orderTypes'

type CancellationByOrder = Record<string, string | undefined>
type CancelErrorsByOrder = Record<string, string | undefined>

export interface OpenOrderInput {
  assetImages: { contra?: string; target?: string }
  orderId: string
}

export function Orders({
  capability,
  onOpenOrder,
  selectedChainId
}: {
  capability: Pick<OrdersCapability, 'cancel' | 'hydrateTokenImage'>
  onOpenOrder: (input: OpenOrderInput) => void
  selectedChainId: number
}) {
  const shared = useWalletSelector(
    useShallow((state) => {
      const account = (state.accounts as Partial<typeof state.accounts>)[state.currentAccount]
      const operations: Record<string, (typeof state.operations)[string] | undefined> = state.operations
      return {
        accountAddress: account?.address ?? '',
        networks: state.networks.ethereum,
        networksMeta: state.networksMeta.ethereum,
        operations,
        orders: state.orders,
        tokens: state.tokens,
        showTestnets: !!state.showTestnets
      }
    })
  )
  const [cancellations, setCancellations] = useState<CancellationByOrder>({})
  const cancellationsRef = useRef(cancellations)
  const [cancelErrors, setCancelErrors] = useState<CancelErrorsByOrder>({})
  const orders = createOrderRows({ ...shared, selectedChainId })
  const projectedCancelErrors = Object.fromEntries(
    Object.entries(cancelErrors).filter((entry): entry is [string, string] => entry[1] !== undefined)
  )
  const cancellingOrderIds = new Set<string>()
  const cancellationEntries = Object.entries(cancellations).filter(
    (entry): entry is [string, string] => entry[1] !== undefined
  )

  cancellationEntries.forEach(([orderId, operationId]) => {
    const operation = shared.operations[operationId]
    if (!operation || operation.status === 'pending') {
      cancellingOrderIds.add(orderId)
    }
    if (operation?.status === 'failed') {
      projectedCancelErrors[orderId] = operation.error?.message ?? 'Cancel failed.'
    }
  })

  useEffect(() => {
    const terminal = Object.entries(cancellations)
      .filter((entry): entry is [string, string] => entry[1] !== undefined)
      .filter(([, operationId]) => {
        const status = shared.operations[operationId]?.status
        return status === 'failed' || status === 'succeeded'
      })
    if (!terminal.length) {
      return
    }

    const next = { ...cancellationsRef.current }
    const failures: CancelErrorsByOrder = {}
    let changed = false

    for (const [orderId, operationId] of terminal) {
      if (next[orderId] !== operationId) {
        continue
      }
      const operation = shared.operations[operationId]
      if (operation?.status === 'failed') {
        failures[orderId] = operation.error?.message ?? 'Cancel failed.'
      }
      delete next[orderId]
      changed = true
    }

    if (changed) {
      cancellationsRef.current = next
      setCancellations(next)
    }
    if (Object.keys(failures).length) {
      setCancelErrors((current) => ({ ...current, ...failures }))
    }
  }, [cancellations, shared.operations])

  const cancel = (order: OrderRow) => {
    if (!order.orderId) {
      return
    }
    const currentOperationId = cancellationsRef.current[order.orderId]
    const currentOperation = currentOperationId ? shared.operations[currentOperationId] : undefined
    if (currentOperationId && (!currentOperation || currentOperation.status === 'pending')) {
      return
    }

    const operationId = crypto.randomUUID()
    const next = { ...cancellationsRef.current, [order.orderId]: operationId }
    cancellationsRef.current = next
    setCancellations(next)
    setCancelErrors((current) => {
      if (!(order.orderId in current)) {
        return current
      }
      const remaining = { ...current }
      delete remaining[order.orderId]
      return remaining
    })
    void capability
      .cancel({ operationId, orderId: order.orderId })
      .then((result) => {
        if (cancellationsRef.current[order.orderId] !== operationId || result.ok) {
          return
        }
        const remaining = { ...cancellationsRef.current }
        delete remaining[order.orderId]
        cancellationsRef.current = remaining
        setCancellations(remaining)
        setCancelErrors((current) => ({
          ...current,
          [order.orderId]: result.message ?? 'Cancel failed.'
        }))
      })
      .catch((error: unknown) => {
        if (cancellationsRef.current[order.orderId] !== operationId) {
          return
        }
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
      imageCapability={capability}
      networks={shared.networks}
      networksMeta={shared.networksMeta}
      onCancel={cancel}
      onOpen={(order) =>
        onOpenOrder({
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
