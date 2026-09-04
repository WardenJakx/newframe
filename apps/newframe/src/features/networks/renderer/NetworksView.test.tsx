import { expect, it, mock } from 'bun:test'

import { render, screen } from '../../../../test/support/componentSetup'
import { NetworksView, type NetworksViewProps } from './NetworksView'

const createProps = (overrides: Partial<NetworksViewProps> = {}): NetworksViewProps => ({
  allTotal: 0,
  enabledChainDots: null,
  getRpcDraft: () => '',
  kebabChainId: 31337,
  onBack: () => {},
  onChangeQuery: () => {},
  onChangeRpcDraft: () => {},
  onRemove: () => {},
  onSaveRpc: () => {},
  onSelect: () => {},
  onToggleChain: () => {},
  onToggleKebab: () => {},
  query: '',
  rows: [
    {
      chainId: 31337,
      icon: null,
      name: 'Localhost',
      on: false,
      removable: true,
      totalValue: 0
    }
  ],
  selectedChainId: 0,
  showTestnets: false,
  ...overrides
})

it('removes a disabled user-added chain', async () => {
  const onRemove = mock(() => {})
  const { user } = render(<NetworksView {...createProps({ onRemove })} />)

  await user.click(screen.getByRole('button', { name: 'Remove Localhost' }))

  expect(onRemove).toHaveBeenCalledWith(31337)
})

it('does not offer removal for enabled or built-in chains', () => {
  const { rerender } = render(
    <NetworksView {...createProps({ rows: [{ ...createProps().rows[0], on: true }] })} />
  )

  expect(screen.queryByRole('button', { name: 'Remove Localhost' })).toBeNull()

  rerender(<NetworksView {...createProps({ rows: [{ ...createProps().rows[0], removable: false }] })} />)

  expect(screen.queryByRole('button', { name: 'Remove Localhost' })).toBeNull()
})
