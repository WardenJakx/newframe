import { formatPairIntent, getDirectionLabel } from '../../../../../domain/flash/pair'
import type { FlashTradeSide } from '../../../../../domain/flash/schemas'
import { timestamp } from '../../StatusNotifications'

export function normalizeOrderSide(side = ''): FlashTradeSide | '' {
  const normalized = String(side).toLowerCase()
  return normalized === 'buy' || normalized === 'sell' ? normalized : ''
}

export function orderStatus(order: any) {
  return String(order.status || order.rawStatus || '')
    .trim()
    .toLowerCase()
}

export function isOpenOrder(order: any) {
  if (order.open === true) return true
  if (order.open === false) return false

  const status = orderStatus(order)
  if (['open', 'pending', 'submitted', 'accepted', 'active', 'working', 'created'].includes(status)) {
    return true
  }
  if (order.terminalAt) return false

  return ![
    'filled',
    'complete',
    'completed',
    'cancelled',
    'canceled',
    'failed',
    'rejected',
    'expired'
  ].includes(status)
}

export function titleize(value = '') {
  return String(value || '')
    .replace(/[-_]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function orderStatusLabel(order: any) {
  return titleize(order.status || order.rawStatus || 'Unknown')
}

export function orderTypeLabel(order: any) {
  return titleize(order.orderType || 'Order')
}

export function orderSideLabel(order: any) {
  const side = normalizeOrderSide(order.side)
  return side ? getDirectionLabel(side) : titleize(order.side || 'Side')
}

export function orderAssetSymbol(asset: any) {
  return String(asset?.symbol || asset?.assetSymbol || asset?.ticker || asset?.id || 'Asset').toUpperCase()
}

export function orderAssetName(asset: any) {
  return String(asset?.name || orderAssetSymbol(asset))
}

export function formatOrderAmount(value: any) {
  if (value === undefined || value === null || value === '') return ''

  const numeric = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''))
  if (Number.isFinite(numeric)) {
    return numeric.toLocaleString(undefined, {
      maximumFractionDigits: numeric >= 1 ? 6 : 8
    })
  }

  return String(value)
}

export function orderSize(order: any) {
  const size = formatOrderAmount(order.qty)
  return size ? `${size} ${orderAssetSymbol(order.targetAsset)}` : ''
}

function firstOrderAmount(...values: any[]) {
  return values.find((value) => value !== undefined && value !== null && value !== '')
}

export function orderAssetAmounts(order: any) {
  const side = normalizeOrderSide(order.side)
  const filledOutput = Number(order.filledOutputAmount) > 0 ? order.filledOutputAmount : undefined
  const inputAmount = formatOrderAmount(
    firstOrderAmount(order.spentAmount, side === 'sell' ? order.qty : undefined)
  )
  const outputAmount = formatOrderAmount(
    firstOrderAmount(
      filledOutput,
      order.outputAmount,
      order.estimatedOutputAmount,
      side === 'buy' ? order.qty : undefined
    )
  )

  return {
    target: side === 'buy' ? outputAmount : inputAmount,
    contra: side === 'buy' ? inputAmount : outputAmount
  }
}

export function hasOrderFill(order: any) {
  const filledAmount = Number(order.filledOutputAmount)
  return (
    (Number.isFinite(filledAmount) && filledAmount > 0) ||
    ['filled', 'complete', 'completed', 'partially-filled', 'partially_filled'].includes(orderStatus(order))
  )
}

export function orderTargetNotional(order: any) {
  const hasExplicitNotional =
    order.targetNotional !== undefined && order.targetNotional !== null && order.targetNotional !== ''
  const explicitNotional = Number(order.targetNotional)
  if (hasExplicitNotional && Number.isFinite(explicitNotional) && explicitNotional >= 0) {
    return formatOrderNotional(explicitNotional)
  }

  const amounts = orderAssetAmounts(order)
  const targetAmount = Number(String(amounts.target || '').replace(/,/g, ''))
  const averageFillPrice = Number(order.averageFillPrice)
  if (
    Boolean(amounts.target) &&
    Number.isFinite(targetAmount) &&
    targetAmount >= 0 &&
    Number.isFinite(averageFillPrice) &&
    averageFillPrice > 0
  ) {
    return formatOrderNotional(targetAmount * averageFillPrice)
  }

  const contraSymbol = orderAssetSymbol(order.contraAsset)
  const contraAmount = Number(String(amounts.contra || '').replace(/,/g, ''))
  if (
    ['DAI', 'USDC', 'USDT'].includes(contraSymbol) &&
    Boolean(amounts.contra) &&
    Number.isFinite(contraAmount) &&
    contraAmount >= 0
  ) {
    return formatOrderNotional(contraAmount)
  }

  return '—'
}

export function orderContraAmount(order: any) {
  if (!hasOrderFill(order)) return '—'
  return orderAssetAmounts(order).contra || '—'
}

export function orderContraNotional(order: any) {
  if (!hasOrderFill(order)) return '—'

  const hasExplicitNotional =
    order.contraNotional !== undefined && order.contraNotional !== null && order.contraNotional !== ''
  const explicitNotional = Number(order.contraNotional)
  if (hasExplicitNotional && Number.isFinite(explicitNotional) && explicitNotional >= 0) {
    return formatOrderNotional(explicitNotional)
  }

  const contraAmount = orderContraAmount(order)
  const numericContraAmount = Number(String(contraAmount).replace(/,/g, ''))
  if (
    ['DAI', 'USDC', 'USDT'].includes(orderAssetSymbol(order.contraAsset)) &&
    contraAmount !== '—' &&
    Number.isFinite(numericContraAmount)
  ) {
    return formatOrderNotional(numericContraAmount)
  }

  return orderTargetNotional(order)
}

export function formatOrderNotional(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: Math.abs(value) < 1 ? 4 : 2
  }).format(value)
}

export function orderDate(value: any) {
  const time = timestamp(value, 0)
  if (!time) return ''

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(time))
}

export function orderDateTime(value: any) {
  const time = timestamp(value, 0)
  if (!time) return ''

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit'
  }).format(new Date(time))
}

export function orderPairIntent(order: any) {
  const side = normalizeOrderSide(order.side)
  const targetSymbol = orderAssetSymbol(order.targetAsset)
  const contraSymbol = orderAssetSymbol(order.contraAsset)

  if (!side) return `${targetSymbol} / ${contraSymbol}`

  return formatPairIntent({
    side,
    targetAsset: { ...(order.targetAsset || {}), symbol: targetSymbol } as any,
    contraAsset: { ...(order.contraAsset || {}), symbol: contraSymbol } as any
  })
}

export function orderJson(value: any) {
  if (value === undefined || value === null) return ''

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export function orderErrorMessage(error: any, fallback: string) {
  if (!error) return fallback
  if (typeof error === 'string') return error
  if (error.message) return error.message
  if (error.error?.message) return error.error.message

  return fallback
}

export function createOrderRows({
  accountAddress,
  networks,
  orders,
  selectedChainId,
  showTestnets
}: {
  accountAddress: string
  networks: Record<string | number, any>
  orders: Record<string, any>
  selectedChainId: number
  showTestnets: boolean
}) {
  const address = accountAddress.toLowerCase()

  return Object.entries(orders)
    .map(([id, order]) => ({ ...order, orderId: order.orderId || id }))
    .filter((order) => {
      const orderAddress = String(order.accountAddress || order.account || order.address || '').toLowerCase()
      const chainIds = [Number(order.targetAsset?.chainId), Number(order.contraAsset?.chainId)].filter(
        (chainId, index, values) =>
          Number.isInteger(chainId) && chainId > 0 && values.indexOf(chainId) === index
      )
      const visibleChainIds = chainIds.filter((chainId) => {
        const chain = networks[chainId]
        return !!chain && (!chain.isTestnet || showTestnets)
      })
      return (
        orderAddress === address &&
        visibleChainIds.length > 0 &&
        (selectedChainId === 0 || visibleChainIds.includes(selectedChainId))
      )
    })
    .sort((a, b) => {
      const openSort = Number(!isOpenOrder(a)) - Number(!isOpenOrder(b))
      if (openSort !== 0) return openSort
      return (
        timestamp(b.createdAt, timestamp(b.updatedAt, 0)) - timestamp(a.createdAt, timestamp(a.updatedAt, 0))
      )
    })
}
