import { expect, it } from 'bun:test'

import { render, screen } from '../../../../../test/support/componentSetup'
import { OrderDetailsView } from './OrderDetailsView'

it('keeps useful sanitized diagnostic sections without rendering executable order material', () => {
  render(
    <OrderDetailsView
      networks={{ 1: { name: 'Ethereum' } }}
      networksMeta={{ 1: {} }}
      onBack={() => {}}
      order={{
        orderId: 'order-1',
        accountAddress: '0x1111111111111111111111111111111111111111',
        chainId: 1,
        provider: 'flash',
        status: 'open',
        rawStatus: 'OPEN',
        orderType: 'market',
        side: 'buy',
        targetAsset: { symbol: 'WETH', chainId: 1 },
        contraAsset: { symbol: 'USDC', chainId: 1 },
        qty: '1',
        createdAt: 1,
        updatedAt: 2,
        rawPayload: {
          orderId: 'order-1',
          provider: 'flash',
          chainId: 1,
          orderType: 'market',
          side: 'buy',
          qty: '1'
        },
        rawStatusPayload: { orderId: 'order-1', status: 'open', rawStatus: 'OPEN', updatedAt: 2 }
      }}
      orderId='order-1'
    />
  )

  expect(screen.getByText('Raw Payload')).toBeTruthy()
  expect(screen.getByText('Status Payload')).toBeTruthy()
  expect(document.body.textContent).toContain('"provider": "flash"')
  expect(document.body.textContent).toContain('"rawStatus": "OPEN"')
  expect(document.body.textContent).not.toMatch(/signature|typedData|calldata|submission/i)
})
