import { describe, expect, it } from 'bun:test'

import { createNetworkRows } from './networkModel'

describe('createNetworkRows', () => {
  it('filters testnets and orders enabled chains by value', () => {
    const rows = createNetworkRows({
      balances: [
        { chainId: 1, totalValue: 2 },
        { chainId: 10, totalValue: 5 }
      ] as any,
      networks: {
        1: { name: 'Ethereum', on: true },
        10: { name: 'Optimism', on: true },
        11155111: { name: 'Sepolia', isTestnet: true, on: true }
      },
      query: '',
      showTestnets: false
    })

    expect(rows.map((row) => row.chainId)).toEqual([10, 1])
  })
})
