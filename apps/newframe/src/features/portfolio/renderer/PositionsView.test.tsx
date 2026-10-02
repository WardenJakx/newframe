import { expect, it, mock } from 'bun:test'

import { render, screen } from '../../../../test/support/componentSetup'
import { registerTestRuntimeFixture } from '../../../../test/support/rendererClient'
import { PositionsView } from './PositionsView'

registerTestRuntimeFixture()

const balance = (symbol: string, totalValue: number) => ({
  address: symbol,
  balance: '1',
  chainId: 1,
  decimals: 18,
  displayBalance: '1',
  hasPrice: true,
  name: symbol,
  symbol,
  tokenBalance: 1,
  totalValue,
  unformattedBalance: 1,
  rate: { usdRate: totalValue, source: 'fixed' as const }
})

it('keeps portfolio groups, asset actions, and pagination independent', async () => {
  const props = {
    dustExpanded: false,
    dustRowsVisible: 1,
    groups: {
      important: [balance('ETH', 100)],
      secondary: [balance('USDC', 0.5), balance('DAI', 0.2)],
      secondaryValue: 0.7,
      dust: [balance('DUST', 0.001), balance('TINY', 0.002)]
    },
    imageCapability: { hydrateTokenImage: async () => {} },
    networks: { 1: { name: 'Ethereum' } },
    networksMeta: {},
    onChangeQuery: mock(() => {}),
    onOpenAsset: mock(() => {}),
    onShowMoreDust: mock(() => {}),
    onShowMoreSecondary: mock(() => {}),
    onToggleDust: mock(() => {}),
    onToggleSecondary: mock(() => {}),
    query: '',
    secondaryExpanded: true,
    secondaryRowsVisible: 1
  }
  const { user, rerender } = render(<PositionsView {...props} />)

  expect(screen.getByRole('button', { name: '2 assets below 1% hidden' }).textContent).toContain('$0.70')
  expect(screen.getByRole('button', { name: '2 low value tokens hidden' }).textContent).toContain('<$0.01')
  expect(screen.queryByRole('button', { name: 'DAI asset details' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'DUST asset details' })).toBeNull()
  await user.click(screen.getByRole('button', { name: 'USDC asset details' }))
  expect(props.onOpenAsset).toHaveBeenCalledWith(expect.objectContaining({ symbol: 'USDC' }))
  await user.click(screen.getByRole('button', { name: 'Show 1 more assets' }))
  expect(props.onShowMoreSecondary).toHaveBeenCalledTimes(1)
  expect(props.onShowMoreDust).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: '2 low value tokens hidden' }))
  expect(props.onToggleDust).toHaveBeenCalledTimes(1)
  expect(props.onToggleSecondary).not.toHaveBeenCalled()

  rerender(<PositionsView {...props} dustExpanded secondaryExpanded={false} />)
  expect(screen.queryByRole('button', { name: 'USDC asset details' })).toBeNull()
  expect(screen.getByRole('button', { name: 'DUST asset details' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'TINY asset details' })).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Show 1 more low value tokens' }))
  expect(props.onShowMoreDust).toHaveBeenCalledTimes(1)
})
