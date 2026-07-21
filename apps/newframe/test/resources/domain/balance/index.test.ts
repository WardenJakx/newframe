import { describe, expect, it } from 'bun:test'

import {
  sortByTotalValue as byTotalValue,
  createBalance,
  createBalanceSummarySelector,
  createBalanceSummaries,
  createDisplayBalance,
  formatBalanceNotionalValue,
  isLowValueTokenBalance
} from '../../../../resources/domain/balance'

describe('#createBalance', () => {
  it('creates a balance with an unknown price when no quote is available', () => {
    const quote = undefined
    const balance = createBalance({ balance: '0x2ed3afa800', decimals: 18 } as any, quote)

    expect(balance.price).toBe('?')
  })

  it('creates a balance with no price change data when no quote is available', () => {
    const quote = undefined
    const balance = createBalance({ balance: '0x2ed3afa800', decimals: 18 } as any, quote)

    expect(balance.priceChange).toBeFalsy()
  })

  it('creates a balance with zero total value when no quote is available', () => {
    const quote = undefined
    const balance = createBalance({ balance: '0x2ed3afa800', decimals: 18 } as any, quote)

    expect(balance.totalValue).toBe(0)
  })

  it('creates a balance with an unknown display value when no quote is available', () => {
    const quote = undefined
    const balance = createBalance({ balance: '0x2ed3afa800', decimals: 18 } as any, quote)

    expect(balance.displayValue).toBe('?')
  })
})

describe('#sortByTotalValue', () => {
  const mockBalance = (totalValue: any, balance = 0, decimals = 0) => ({
    totalValue,
    decimals,
    balance
  })

  it('should sort balances in descending order by total value', () => {
    const values = [10, 100, 60]
    const unsorted: any[] = values.map(mockBalance as any)

    const sortedValues = unsorted.sort(byTotalValue as any).map((b) => b.totalValue)

    expect(sortedValues).toStrictEqual([100, 60, 10])
  })

  it('should sort balances in descending order by balance', () => {
    const values = [10, 100, 60]
    const unsorted = values.map((value) => mockBalance(10, value))

    const sortedValues = unsorted.sort(byTotalValue as any).map((b) => b.balance)

    expect(sortedValues).toStrictEqual([100, 60, 10])
  })

  it('should sort balances in descending order by totalValue and balance', () => {
    const bal1 = mockBalance(10, 20)
    const bal2 = mockBalance(100, 990)
    const bal3 = mockBalance(0, 1000)
    const bal4 = mockBalance(100, 989)

    const unsorted = [bal1, bal2, bal3, bal4]
    const sortedValues = unsorted.sort(byTotalValue as any)

    expect(sortedValues).toStrictEqual([bal2, bal4, bal1, bal3])
  })
})

describe('#isLowValueTokenBalance', () => {
  it('does not treat balances with unknown prices as low value', () => {
    expect(isLowValueTokenBalance({ totalValue: 0, hasPrice: false })).toBe(false)
  })

  it('treats priced zero-value balances as low value', () => {
    expect(isLowValueTokenBalance({ totalValue: 0, hasPrice: true })).toBe(true)
  })
})

describe('#formatBalanceNotionalValue', () => {
  it('displays zero dollars for balances without a price', () => {
    expect(formatBalanceNotionalValue({ totalValue: 0, hasPrice: false })).toBe('$0')
  })

  it('keeps the low-value display for priced dust balances', () => {
    expect(formatBalanceNotionalValue({ totalValue: 0, hasPrice: true })).toBe('<$0.01')
  })

  it('formats priced balances with cents', () => {
    expect(formatBalanceNotionalValue({ totalValue: 12.345, hasPrice: true })).toBe('$12.34')
  })
})

describe('#createBalanceSummaries', () => {
  it('creates sorted lightweight summaries that can be materialized for display', () => {
    const summaries = createBalanceSummaries({
      rawBalances: [
        {
          address: '0x0000000000000000000000000000000000000001',
          balance: '0x64',
          chainId: 1,
          decimals: 0,
          displayBalance: '',
          name: 'Small Token',
          symbol: 'SMOL'
        },
        {
          address: '0x0000000000000000000000000000000000000002',
          balance: '0x32',
          chainId: 1,
          decimals: 0,
          displayBalance: '',
          name: 'Large Token',
          symbol: 'BIG'
        }
      ],
      rates: {
        '0x0000000000000000000000000000000000000001': { usd: { price: 1, change24hr: 0 } },
        '0x0000000000000000000000000000000000000002': { usd: { price: 5, change24hr: 0 } }
      },
      networks: {
        1: { name: 'Mainnet', on: true }
      },
      networksMeta: {
        1: { nativeCurrency: { symbol: 'ETH', decimals: 18 } }
      },
      includeChain: (chain) => !!chain.on
    })

    expect(summaries.map((balance) => balance.symbol)).toEqual(['BIG', 'SMOL'])
    expect(summaries.map((balance) => balance.totalValue)).toEqual([250, 100])
    expect(createDisplayBalance(summaries[0]).displayBalance).toBe('50.00')
  })
})

describe('#createBalanceSummarySelector', () => {
  it('reuses summaries until the store inputs or filter cache key change', () => {
    const rawBalances = [
      {
        address: '0x0000000000000000000000000000000000000001',
        balance: '0x64',
        chainId: 1,
        decimals: 0,
        displayBalance: '',
        name: 'Token',
        symbol: 'TOK'
      }
    ]
    const rates = {
      '0x0000000000000000000000000000000000000001': { usd: { price: 1, change24hr: 0 } }
    }
    const networks = {
      1: { name: 'Mainnet', on: true }
    }
    const networksMeta = {
      1: { nativeCurrency: { symbol: 'ETH', decimals: 18 } }
    }
    const selectBalanceSummaries = createBalanceSummarySelector()

    const first = selectBalanceSummaries({
      rawBalances,
      rates,
      networks,
      networksMeta,
      includeChain: (chain) => !!chain.on,
      cacheKey: 'mainnet'
    })
    const second = selectBalanceSummaries({
      rawBalances,
      rates,
      networks,
      networksMeta,
      includeChain: (chain) => !!chain.on,
      cacheKey: 'mainnet'
    })
    const third = selectBalanceSummaries({
      rawBalances,
      rates,
      networks,
      networksMeta,
      includeChain: () => false,
      cacheKey: 'hidden'
    })

    expect(second).toBe(first)
    expect(third).not.toBe(first)
    expect(third).toHaveLength(0)
  })
})
