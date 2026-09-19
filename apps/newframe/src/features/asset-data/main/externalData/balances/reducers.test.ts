import { describe, expect, it } from 'bun:test'

import type { Token } from '../../../../tokens/domain/state/token'
import { groupByChain, type TokensByChain } from './reducers'

describe('#groupByChain', () => {
  it('groups tokens by chain', () => {
    const tokens = [
      { chainId: 1, symbol: 'OHM' },
      { chainId: 4, symbol: 'ZRX' },
      { chainId: 137, symbol: 'AAVE' },
      { chainId: 4, symbol: 'BADGER' },
      { chainId: 1, symbol: 'AUSDC' }
    ]

    const grouped = tokens.reduce<TokensByChain>(
      (result, token) => groupByChain(result, token as unknown as Token),
      {}
    )

    expect(grouped as unknown).toEqual({
      1: [
        { chainId: 1, symbol: 'OHM' },
        { chainId: 1, symbol: 'AUSDC' }
      ],
      4: [
        { chainId: 4, symbol: 'ZRX' },
        { chainId: 4, symbol: 'BADGER' }
      ],
      137: [{ chainId: 137, symbol: 'AAVE' }]
    })
  })
})
