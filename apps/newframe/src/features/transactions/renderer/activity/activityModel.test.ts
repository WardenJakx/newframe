import { describe, expect, it } from 'bun:test'

import {
  activityBalanceChangeLabel,
  activityGasLabel,
  activityTimestampLabel,
  createActivityRows,
  transactionStatusLabel
} from './activityModel'

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

  it('formats persisted confirmation metadata for the activity row', () => {
    const activity = {
      submittedAt: new Date('2026-07-23T13:32:00Z').getTime(),
      gasSpent: '0x1319718a5000',
      balanceChanges: [
        {
          id: 'usdc-out',
          kind: 'erc20',
          direction: 'out',
          label: 'Asset out',
          amount: '0xf3e58',
          decimals: 6,
          symbol: 'USDC'
        }
      ]
    }

    expect(activityTimestampLabel(activity)).toMatch(/2026/)
    expect(activityTimestampLabel(activity)).toMatch(/1:32|13:32/)
    expect(activityBalanceChangeLabel(activity)).toBe('−0.999 USDC')
    expect(activityGasLabel(activity)).toBe('Gas 0.000021 ETH')
  })

  it('does not assume token decimals when metadata is unavailable', () => {
    expect(
      activityBalanceChangeLabel({
        balanceChanges: [
          {
            kind: 'erc20',
            direction: 'out',
            amount: '0x7ed6b40',
            symbol: 'Token'
          }
        ]
      })
    ).toBe('−? Token')
  })

  it('uses catalog metadata to repair a persisted generic token effect', () => {
    expect(
      activityBalanceChangeLabel(
        {
          balanceChanges: [
            {
              kind: 'erc20',
              direction: 'out',
              amount: '0x7ed6b40',
              assetAddress: '0xusdc',
              decimals: 18,
              symbol: 'Token'
            }
          ]
        },
        'ETH',
        (address) => (address === '0xusdc' ? { decimals: 6, symbol: 'USDC' } : undefined)
      )
    ).toBe('−133 USDC')
  })
})
