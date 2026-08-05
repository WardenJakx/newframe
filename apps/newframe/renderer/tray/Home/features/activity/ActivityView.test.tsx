import { describe, expect, it, mock } from 'bun:test'

import { render, screen } from '../../../../../test/support/componentSetup'
import { ActivityView } from './ActivityView'

const hash = `0x${'1'.repeat(64)}`
const networks = { 1: { name: 'Ethereum', explorer: 'https://etherscan.io' } }
const networksMeta = {
  1: { nativeCurrency: { name: 'Ether', symbol: 'ETH' } }
}
const tokens = { byId: {}, accountTokenIds: {} }

function activity(overrides: Record<string, unknown> = {}) {
  return {
    id: hash,
    hash,
    chainId: 1,
    status: 'succeeded',
    submittedAt: new Date('2026-07-23T13:32:00Z').getTime(),
    display: { title: 'Send USDC', subtitle: 'USD Coin' },
    recognizedActions: [
      {
        id: 'erc20:transfer',
        data: {
          amount: '0xf3e58',
          decimals: 6,
          symbol: 'USDC',
          contract: '0x0000000000000000000000000000000000000001'
        }
      }
    ],
    gasSpent: '0x1319718a5000',
    balanceChanges: [
      {
        id: 'usdc-out',
        kind: 'erc20',
        direction: 'out',
        label: 'Asset out',
        amount: '0xf3e58',
        decimals: 6,
        symbol: 'USDC',
        assetAddress: '0x0000000000000000000000000000000000000001'
      }
    ],
    ...overrides
  }
}

describe('ActivityView', () => {
  it('opens confirmed transactions in the explorer without opening the pending details panel', async () => {
    const onOpen = mock()
    const onOpenExplorer = mock()
    const { user } = render(
      <ActivityView
        activity={[activity()]}
        networks={networks}
        networksMeta={networksMeta}
        onOpen={onOpen}
        onOpenExplorer={onOpenExplorer}
        tokens={tokens}
      />
    )

    await user.click(screen.getByRole('button', { name: `Open transaction ${hash} in explorer` }))

    expect(onOpenExplorer).toHaveBeenCalledWith(expect.objectContaining({ hash }))
    expect(onOpen).not.toHaveBeenCalled()
    expect(screen.getByText('USDC')).toBeTruthy()
    expect(screen.getByText('−0.999 USDC')).toBeTruthy()
    expect(screen.getByText('Gas 0.000021 ETH')).toBeTruthy()
    expect(screen.getByText(/2026/)).toBeTruthy()
  })

  it('keeps pending activity wired to the transaction details panel', async () => {
    const onOpen = mock()
    const onOpenExplorer = mock()
    const pending = activity({ id: 'pending', hash: undefined, status: 'confirming' })
    const { user } = render(
      <ActivityView
        activity={[pending]}
        networks={networks}
        networksMeta={networksMeta}
        onOpen={onOpen}
        onOpenExplorer={onOpenExplorer}
        tokens={tokens}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Send USDC Confirming' }))

    expect(onOpen).toHaveBeenCalledWith('pending')
    expect(onOpenExplorer).not.toHaveBeenCalled()
  })

  it('keeps the status checkmark for unknown confirmed actions', () => {
    render(
      <ActivityView
        activity={[
          activity({
            display: { title: 'depositToken', subtitle: 'Unknown contract' },
            recognizedActions: [],
            balanceChanges: []
          })
        ]}
        networks={networks}
        networksMeta={networksMeta}
        onOpen={() => {}}
        onOpenExplorer={() => {}}
        tokens={tokens}
      />
    )

    expect(document.querySelector('[data-status-glyph="completed"]')).toBeTruthy()
  })
})
