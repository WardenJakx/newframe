import { formatPairIntent, getDirectionLabel } from '../../../../../resources/domain/flash/pair'
import type { FlashTradeSide } from '../../../../../resources/domain/flash/schemas'
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

export function orderDate(value: any) {
  const time = timestamp(value, 0)
  if (!time) return ''

  return new Intl.DateTimeFormat(undefined, {
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
      const chainId = Number(order.chainId)
      const chain = networks[chainId]
      return (
        orderAddress === address &&
        !!chain &&
        (!chain.isTestnet || showTestnets) &&
        (selectedChainId === 0 || selectedChainId === chainId)
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
