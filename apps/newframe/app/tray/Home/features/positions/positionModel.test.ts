import { describe, expect, it } from 'bun:test'

import { createPositionGroups } from './positionModel'

const balance = (symbol: string, totalValue: number, address = symbol) => ({
  address,
  balance: '1',
  chainId: 1,
  decimals: 18,
  displayBalance: '1',
  hasPrice: true,
  name: symbol,
  priceChange: '0',
  symbol,
  tokenBalance: 1,
  totalValue,
  unformattedBalance: 1,
  usdRate: { price: totalValue }
})

describe('createPositionGroups', () => {
  it('filters by query and groups balances by importance', () => {
    const groups = createPositionGroups({
      balances: [balance('ETH', 100), balance('USDC', 0.5), balance('DUST', 0.001)],
      networks: { 1: { name: 'Ethereum' } },
      query: '',
      selectedChainId: 0
    })

    expect(groups.important.map((item) => item.symbol)).toEqual(['ETH'])
    expect(groups.secondary.map((item) => item.symbol)).toEqual(['USDC'])
    expect(groups.dust.map((item) => item.symbol)).toEqual(['DUST'])
  })

  it('returns no rows when the filter does not match', () => {
    const groups = createPositionGroups({
      balances: [balance('ETH', 100)],
      networks: { 1: { name: 'Ethereum' } },
      query: 'bitcoin',
      selectedChainId: 0
    })

    expect(groups).toEqual({ dust: [], important: [], secondary: [], secondaryValue: 0 })
  })
})
