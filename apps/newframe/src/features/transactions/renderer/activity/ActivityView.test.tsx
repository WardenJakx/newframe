import { describe, expect, it, mock } from 'bun:test'

import { render, screen } from '../../../../../test/support/componentSetup'
import { registerTestRuntimeFixture } from '../../../../../test/support/rendererClient'
import { ActivityView } from './ActivityView'
import { createRendererUtilityCapabilities as createUtilityPorts } from '../../../../shared/renderer/capabilities.test-support'

const fixture = registerTestRuntimeFixture()
const utilityPorts = createUtilityPorts({
  executeCommand: (command) => fixture.client.executeCommand(command)
})
type CommandCall = [command: Parameters<typeof fixture.client.executeCommand>[0]]
const hash = `0x${'1'.repeat(64)}`
const wethAddress = '0x0000000000000000000000000000000000000002'
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
    const onOpen = mock((_activityId: string) => undefined)
    const onOpenExplorer = mock((_record: ReturnType<typeof activity>) => undefined)
    const { user } = render(
      <ActivityView
        activity={[activity()]}
        clipboard={utilityPorts}
        imageCapability={utilityPorts}
        networks={networks}
        networksMeta={networksMeta}
        onOpen={onOpen}
        onOpenExplorer={onOpenExplorer}
        tokens={tokens}
      />
    )

    await user.click(screen.getByRole('button', { name: `Open transaction ${hash} in explorer` }))

    const explorerCalls: Array<[record: ReturnType<typeof activity>]> = onOpenExplorer.mock.calls
    const openCalls: Array<[activityId: string]> = onOpen.mock.calls
    expect(explorerCalls.map(([record]) => record.hash)).toEqual([hash])
    expect(openCalls).toEqual([])
    expect(screen.getByText('0x1111…1111').closest('[data-transaction-link]')).toBeTruthy()
    expect(screen.getByText('0x1111…1111').getAttribute('data-tone')).toBe('secondary')
    expect(document.querySelector('[data-status-glyph="completed"]')).toBeNull()
  })

  it('keeps a confirmed hash readable without an explorer and copies the full hash', async () => {
    const { user } = render(
      <ActivityView
        activity={[activity()]}
        clipboard={utilityPorts}
        imageCapability={utilityPorts}
        networks={{ 1: { name: 'Ethereum', explorer: '' } }}
        networksMeta={networksMeta}
        onOpen={() => {}}
        onOpenExplorer={() => {}}
        tokens={tokens}
      />
    )

    expect(screen.queryByRole('button', { name: `Open transaction ${hash} in explorer` })).toBeNull()
    expect(screen.getByText('0x1111…1111').getAttribute('data-tone')).toBe('secondary')

    await user.click(screen.getByRole('button', { name: `Copy transaction hash ${hash}` }))

    const commandCalls = fixture.client.executeCommand.mock.calls as CommandCall[]
    expect(commandCalls).toEqual([[{ type: 'clipboard.write', text: hash }]])
    expect(screen.getByRole('button', { name: `Transaction hash copied ${hash}` })).toBeTruthy()
  })

  it('uses the approved token icon even when an approval has no balance change', () => {
    render(
      <ActivityView
        activity={[
          activity({
            balanceChanges: [],
            data: { to: wethAddress },
            display: { title: 'Approve WETH', subtitle: 'Wrapped Ether' },
            recognizedActions: [],
            tokenData: { symbol: 'WETH' }
          })
        ]}
        clipboard={utilityPorts}
        imageCapability={utilityPorts}
        networks={networks}
        networksMeta={networksMeta}
        onOpen={() => {}}
        onOpenExplorer={() => {}}
        tokens={{
          byId: {
            [`1:${wethAddress}`]: {
              address: wethAddress,
              chainId: 1,
              name: 'Wrapped Ether',
              symbol: 'WETH',
              decimals: 18,
              image: { base64: 'd2V0aA==', contentHash: 'fixture-weth', mimeType: 'image/png' },
              custom: false,
              curated: true,
              sources: ['bundled'],
              updatedAt: 1
            }
          },
          accountTokenIds: {}
        }}
      />
    )

    expect(document.querySelector('img')?.getAttribute('src')).toBe('data:image/png;base64,d2V0aA==')
    expect(document.querySelector('[data-status-glyph="completed"]')).toBeNull()
  })

  it('keeps pending activity wired to the transaction details panel', async () => {
    const onOpen = mock((_activityId: string) => undefined)
    const onOpenExplorer = mock((_record: ReturnType<typeof activity>) => undefined)
    const pending = activity({ id: 'pending', hash: undefined, status: 'confirming' })
    const { user } = render(
      <ActivityView
        activity={[pending]}
        clipboard={utilityPorts}
        imageCapability={utilityPorts}
        networks={networks}
        networksMeta={networksMeta}
        onOpen={onOpen}
        onOpenExplorer={onOpenExplorer}
        tokens={tokens}
      />
    )

    await user.click(screen.getByRole('button', { name: 'Send USDC Confirming' }))

    const openCalls: Array<[activityId: string]> = onOpen.mock.calls
    const explorerCalls: Array<[record: ReturnType<typeof activity>]> = onOpenExplorer.mock.calls
    expect(openCalls).toEqual([['pending']])
    expect(explorerCalls).toEqual([])
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
        clipboard={utilityPorts}
        imageCapability={utilityPorts}
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
