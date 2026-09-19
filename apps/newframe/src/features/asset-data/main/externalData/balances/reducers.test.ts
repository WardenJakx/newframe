import { describe, expect, it } from 'bun:test'

import type { Token } from '../../../../../platform/state-store/state'
import { groupByChain, type TokensByChain } from './reducers'

type ChainToken = Pick<Token, 'chainId' | 'symbol'>

const groupPartialTokensByChain = groupByChain as unknown as (
  grouped: Record<number, ChainToken[]>,
  token: ChainToken
) => Record<number, ChainToken[]>

describe('#groupByChain', () => {
  it('groups tokens by chain', () => {
    const tokens = [
      { chainId: 1, symbol: 'OHM' },
      { chainId: 4, symbol: 'ZRX' },
      { chainId: 137, symbol: 'AAVE' },
      { chainId: 4, symbol: 'BADGER' },
      { chainId: 1, symbol: 'AUSDC' }
    ]

    const grouped = tokens.reduce(groupPartialTokensByChain, {} satisfies TokensByChain)

    expect(grouped).toEqual({
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
