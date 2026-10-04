import type { FlashOrderStatus } from './orders.ts'

const terminal = new Set<FlashOrderStatus>(['filled', 'cancelled', 'rejected', 'terminated', 'expired'])
const open = new Set<FlashOrderStatus>(['pending', 'accepted', 'partially-filled'])

export function normalizeFlashStatus(status: unknown): FlashOrderStatus {
  if (status === undefined || status === null) {
    return 'accepted'
  }
  if (typeof status !== 'string') {
    return 'terminated'
  }
  const raw = status.trim()
  const value = (raw || 'accepted')
    .toLowerCase()
    .replace(/^order_status_/, '')
    .replaceAll('_', '-')
  if (value === 'canceled') {
    return 'cancelled'
  }
  if (['open', 'active', 'working', 'created'].includes(value)) {
    return 'accepted'
  }
  if (terminal.has(value as FlashOrderStatus) || open.has(value as FlashOrderStatus)) {
    return value as FlashOrderStatus
  }
  return raw ? 'terminated' : 'accepted'
}

export function flashRawStatus(status: FlashOrderStatus) {
  return `ORDER_STATUS_${status.replaceAll('-', '_').toUpperCase()}`
}

export function isFlashTerminalStatus(status: FlashOrderStatus) {
  return terminal.has(status)
}

export function isFlashOpenStatus(status: FlashOrderStatus) {
  return open.has(status)
}
