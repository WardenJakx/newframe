import { describe, expect, it } from 'bun:test'

import {
  formatOrderAmount,
  isOpenOrder,
  normalizeOrderSide,
  orderPairIntent,
  orderStatusLabel
} from './orderModel'

describe('orderModel', () => {
  it('normalizes supported trade sides', () => {
    expect(normalizeOrderSide('BUY')).toBe('buy')
    expect(normalizeOrderSide('sell')).toBe('sell')
    expect(normalizeOrderSide('swap')).toBe('')
  })

  it('distinguishes open and terminal orders', () => {
    expect(isOpenOrder({ status: 'working' })).toBe(true)
    expect(isOpenOrder({ status: 'filled' })).toBe(false)
    expect(isOpenOrder({ status: 'unknown', terminalAt: Date.now() })).toBe(false)
  })

  it('builds display values without renderer state', () => {
    const order = {
      side: 'buy',
      status: 'partially_filled',
      targetAsset: { symbol: 'eth' },
      contraAsset: { symbol: 'usdc' }
    }

    expect(orderStatusLabel(order)).toBe('Partially Filled')
    expect(orderPairIntent(order)).toContain('ETH')
    expect(orderPairIntent(order)).toContain('USDC')
    expect(formatOrderAmount('1.234567891')).toBe('1.234568')
  })
})
