import { describe, expect, it, mock } from 'bun:test'

import { render, screen } from '../../../../../test/support/componentSetup'

mock.module('../../../../shared/renderer/ui/TrayOverlay', () => ({
  TrayOverlay: ({ children }: any) => <div>{children}</div>
}))
mock.module('../../../requests/renderer/Account/Requests/TransactionRequest/TransactionInformation', () => ({
  default: ({ effects }: any) => (
    <section aria-label='Transaction effects'>
      {effects.map((effect: any) => (
        <div aria-label={`${effect.direction} effect`} key={effect.id}>
          {effect.label} {effect.amount} {effect.symbol}
        </div>
      ))}
    </section>
  )
}))

const { ActivityDetailsView } = await import('./ActivityDetailsView')

describe('ActivityDetailsView', () => {
  it('renders explicit recipient changes instead of reconstructed sender effects', () => {
    const recipientEffect = {
      id: 'usdc-in',
      kind: 'erc20',
      direction: 'in',
      label: 'Asset in',
      amount: '0xf4240',
      decimals: 6,
      symbol: 'USDC',
      assetAddress: '0x0000000000000000000000000000000000000001'
    }

    render(
      <ActivityDetailsView
        activity={
          {
            id: 'recipient-row',
            hash: `0x${'1'.repeat(64)}`,
            account: '0x2222222222222222222222222222222222222222',
            chainId: 1,
            status: 'succeeded',
            data: { from: '0x1111111111111111111111111111111111111111' },
            simulation: {
              status: 'success',
              effects: [{ ...recipientEffect, id: 'usdc-out', direction: 'out' }]
            },
            balanceChanges: [recipientEffect]
          } as any
        }
        capability={{ copyText: mock(), hydrateTokenImage: mock() } as any}
        network={{ name: 'Ethereum' }}
        networkMeta={{ nativeCurrency: { name: 'Ether', symbol: 'ETH' } } as any}
        onBack={() => {}}
        originName='Example app'
      />
    )

    expect(screen.getByLabelText('in effect').textContent).toBe('Asset in 0xf4240 USDC')
    expect(screen.queryByLabelText('out effect')).toBeNull()
  })
})
