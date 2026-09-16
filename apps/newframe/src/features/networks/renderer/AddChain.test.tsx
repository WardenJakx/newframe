import { describe, expect, it, mock } from 'bun:test'

import { fireEvent, render, screen } from '../../../../test/support/componentSetup'
import { AddChain } from './AddChain'
import type { NetworksCapability } from './networksCapability'

describe('AddChain', () => {
  const pending = {
    requestId: 'request-1',
    chain: {
      explorer: 'https://explorer.example.com',
      icon: 'https://icons.example.com/chain.png',
      id: 4660,
      name: 'Bizarro Polygon',
      nativeCurrencyName: 'New',
      primaryRpc: 'https://rpc.example.com',
      secondaryRpc: 'https://backup-rpc.example.com',
      symbol: 'NEW'
    }
  }

  it('shows the chain identity and each supplied setting', () => {
    render(
      <AddChain
        capability={{ resolveAddChain: async () => ({ ok: true }) }}
        onResolved={() => undefined}
        pending={pending}
      />
    )

    expect(screen.getByRole('heading', { level: 2, name: 'Bizarro Polygon' })).toBeTruthy()
    expect(screen.getByText('4660 (0x1234)')).toBeTruthy()
    expect(screen.getByText('New (NEW)')).toBeTruthy()
    expect(screen.getByText('https://backup-rpc.example.com')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add chain' })).toBeTruthy()
  })

  it('resolves the header and footer actions', () => {
    const resolveAddChain = mock(async (_input: Parameters<NetworksCapability['resolveAddChain']>[0]) => ({
      ok: true as const
    }))
    const onResolved = mock((_outcome: 'approved' | 'rejected') => undefined)
    render(<AddChain capability={{ resolveAddChain }} onResolved={onResolved} pending={pending} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add chain' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reject chain' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))

    expect(resolveAddChain.mock.calls).toEqual([
      [{ approved: true, requestId: 'request-1' }],
      [{ approved: false, requestId: 'request-1' }],
      [{ approved: false, requestId: 'request-1' }]
    ])
    expect(onResolved.mock.calls).toEqual([['approved'], ['rejected'], ['rejected']])
  })
})
