import { describe, expect, it } from 'bun:test'

import {
  createOrderRows,
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

  it('filters orders when either participating asset matches the selected chain', () => {
    const order = {
      orderId: 'cross-chain-order',
      accountAddress: '0x1111111111111111111111111111111111111111',
      targetAsset: { symbol: 'WETH', chainId: 1 },
      contraAsset: { symbol: 'USDC', chainId: 8453 },
      createdAt: 1,
      updatedAt: 1
    }
    const options = {
      accountAddress: order.accountAddress,
      networks: {
        1: { id: 1, isTestnet: false },
        8453: { id: 8453, isTestnet: false }
      },
      orders: { [order.orderId]: order },
      showTestnets: false
    }

    expect(createOrderRows({ ...options, selectedChainId: 1 })).toHaveLength(1)
    expect(createOrderRows({ ...options, selectedChainId: 8453 })).toHaveLength(1)
    expect(createOrderRows({ ...options, selectedChainId: 10 })).toHaveLength(0)
  })
})
