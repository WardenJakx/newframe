import { describe, expect, it } from 'bun:test'

import { createChainRows } from './chainModel.ts'

describe('createChainRows', () => {
  it('filters testnets and orders enabled chains by value', () => {
    const rows = createChainRows({
      balances: [
        { chainId: 1, totalValue: 2 },
        { chainId: 10, totalValue: 5 }
      ] as unknown as Parameters<typeof createChainRows>[0]['balances'],
      chains: {
        1: { name: 'Ethereum', on: true },
        10: { name: 'Optimism', on: true },
        11155111: { name: 'Sepolia', isTestnet: true, on: true }
      },
      query: '',
      showTestnets: false
    })

    expect(rows.map((row) => row.chainId)).toEqual([10, 1])
  })

  it('only marks user-added chains as removable', () => {
    const rows = createChainRows({
      balances: [],
      chains: {
        1: { name: 'Ethereum', on: true },
        31337: { name: 'Localhost', on: false }
      },
      query: '',
      showTestnets: false
    })

    expect(rows.map(({ chainId, removable }) => ({ chainId, removable }))).toEqual([
      { chainId: 1, removable: false },
      { chainId: 31337, removable: true }
    ])
  })
})
