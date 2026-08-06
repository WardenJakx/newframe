import { describe, expect, it } from 'bun:test'

import {
  createOrderRows,
  formatOrderAmount,
  hasOrderFill,
  isOpenOrder,
  normalizeOrderSide,
  orderAssetAmounts,
  orderContraAmount,
  orderContraNotional,
  orderPairIntent,
  orderTargetNotional,
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

  it('maps input and output amounts to their visible assets', () => {
    const amounts = { spentAmount: '1', outputAmount: '2398.08', qty: '1' }

    expect(orderAssetAmounts({ ...amounts, side: 'sell' })).toEqual({
      target: '1',
      contra: '2,398.08'
    })
    expect(orderAssetAmounts({ ...amounts, side: 'buy' })).toEqual({
      target: '2,398.08',
      contra: '1'
    })
  })

  it('shows target notional and only treats actual fills as filled', () => {
    expect(orderTargetNotional({ targetNotional: '2400' })).toBe('$2,400.00')
    expect(orderTargetNotional({ targetNotional: null, contraAsset: { symbol: 'ETH' } })).toBe('—')
    expect(
      orderTargetNotional({
        side: 'sell',
        qty: '0.5',
        averageFillPrice: '2400',
        targetAsset: { symbol: 'WETH' },
        contraAsset: { symbol: 'ETH' }
      })
    ).toBe('$1,200.00')
    expect(hasOrderFill({ status: 'accepted', filledOutputAmount: '0' })).toBe(false)
    expect(hasOrderFill({ status: 'cancelled', filledOutputAmount: '12' })).toBe(true)
    expect(hasOrderFill({ status: 'filled' })).toBe(true)
    expect(orderContraAmount({ status: 'accepted', outputAmount: '2400', side: 'sell' })).toBe('—')
    expect(
      orderContraNotional({
        status: 'filled',
        side: 'sell',
        filledOutputAmount: '2398.08',
        contraNotional: '2398.08',
        contraAsset: { symbol: 'USDC' }
      })
    ).toBe('$2,398.08')
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
