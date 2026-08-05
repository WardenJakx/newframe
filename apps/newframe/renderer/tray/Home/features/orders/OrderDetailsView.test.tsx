import { expect, it } from 'bun:test'

import { render, screen } from '../../../../../test/support/componentSetup'
import { OrderDetailsView } from './OrderDetailsView'

it('keeps useful sanitized diagnostic sections without rendering executable order material', () => {
  render(
    <OrderDetailsView
      networks={{ 1: { name: 'Ethereum' }, 8453: { name: 'Base' } }}
      networksMeta={{ 1: {}, 8453: {} }}
      onBack={() => {}}
      order={{
        orderId: 'order-1',
        accountAddress: '0x1111111111111111111111111111111111111111',
        provider: 'flash',
        status: 'open',
        rawStatus: 'OPEN',
        orderType: 'market',
        side: 'buy',
        targetAsset: { symbol: 'WETH', chainId: 1 },
        contraAsset: { symbol: 'USDC', chainId: 8453 },
        qty: '1',
        createdAt: 1,
        updatedAt: 2,
        rawPayload: {
          orderId: 'order-1',
          provider: 'flash',
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
  expect(screen.getByText('Source / spent chain')).toBeTruthy()
  expect(screen.getByText('Destination / receive chain')).toBeTruthy()
  expect(screen.getByText('Base')).toBeTruthy()
})

it('shows one shared chain for same-chain orders', () => {
  render(
    <OrderDetailsView
      networks={{ 1: { name: 'Ethereum' } }}
      networksMeta={{ 1: {} }}
      onBack={() => {}}
      order={{
        orderId: 'same-chain-order',
        accountAddress: '0x1111111111111111111111111111111111111111',
        provider: 'flash',
        status: 'filled',
        orderType: 'market',
        side: 'sell',
        targetAsset: { symbol: 'WETH', chainId: 1 },
        contraAsset: { symbol: 'USDC', chainId: 1 },
        qty: '1',
        createdAt: 1,
        updatedAt: 2
      }}
      orderId='same-chain-order'
    />
  )

  expect(screen.getByText('Shared chain')).toBeTruthy()
  expect(screen.queryByText('Source / spent chain')).toBe(null)
})
