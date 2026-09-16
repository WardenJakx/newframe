import { describe, expect, it, mock } from 'bun:test'

import { fireEvent, render, screen } from '../../../../test/support/componentSetup'
import { AddChainView } from './AddChainView'

describe('AddChainView', () => {
  it('shows the chain identity and each supplied setting', () => {
    render(
      <AddChainView
        chain={{
          explorer: 'https://explorer.example.com',
          icon: 'https://icons.example.com/chain.png',
          id: 4660,
          name: 'Bizarro Polygon',
          nativeCurrencyName: 'New',
          primaryRpc: 'https://rpc.example.com',
          secondaryRpc: 'https://backup-rpc.example.com',
          symbol: 'NEW'
        }}
        onApprove={() => undefined}
        onReject={() => undefined}
      />
    )

    expect(screen.getByRole('heading', { level: 2, name: 'Bizarro Polygon' })).toBeTruthy()
    expect(screen.getByText('4660 (0x1234)')).toBeTruthy()
    expect(screen.getByText('New (NEW)')).toBeTruthy()
    expect(screen.getByText('https://backup-rpc.example.com')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Add chain' })).toBeTruthy()
  })

  it('wires the header and footer actions', () => {
    const onApprove = mock(() => undefined)
    const onReject = mock(() => undefined)
    render(<AddChainView chain={{ id: 1, name: 'Ethereum' }} onApprove={onApprove} onReject={onReject} />)

    fireEvent.click(screen.getByRole('button', { name: 'Add chain' }))
    fireEvent.click(screen.getByRole('button', { name: 'Reject chain' }))
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))

    expect(onApprove).toHaveBeenCalledTimes(1)
    expect(onReject).toHaveBeenCalledTimes(2)
  })
})
