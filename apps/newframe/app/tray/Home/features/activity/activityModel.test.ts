import { describe, expect, it } from 'bun:test'

import { createActivityRows, transactionStatusLabel } from './activityModel'

describe('activityModel', () => {
  it('filters activity by account and selected network', () => {
    const rows = createActivityRows({
      accountAddress: '0xabc',
      activity: {
        one: { id: 'one', account: '0xAbC', chainId: 1, submittedAt: 1 },
        two: { id: 'two', account: '0xabc', chainId: 10, submittedAt: 2 }
      },
      networks: { 1: { on: true }, 10: { on: true } },
      selectedChainId: 10,
      showTestnets: false
    })

    expect(rows.map((row) => row.id)).toEqual(['two'])
    expect(transactionStatusLabel('succeeded')).toBe('Confirmed')
  })
})
