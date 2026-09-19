import { expect, it } from 'bun:test'

import { createRendererClient as createTypedClient } from '../../../../../test/support/rendererClient'
import { FLASH_USDC_ASSET, FLASH_WETH_ASSET } from '../domain/assets'
import { FLASH_MARKET_ORDER_TYPE } from '../domain/constants'
import { createTradeCapability } from './tradeService'

it('maps semantic trade actions to their exact catalog operations', async () => {
  const host = createTypedClient()
  const trade = createTradeCapability(host)
  host.executeQuery.mockResolvedValue({ ok: false, error: 'quote_failed', message: 'Unavailable.' })

  expect(
    trade.quote({
      accountAddress: '0x0000000000000000000000000000000000000001',
      contraAsset: FLASH_USDC_ASSET,
      inputAmount: '1',
      orderType: FLASH_MARKET_ORDER_TYPE,
      qty: '1',
      side: 'sell',
      targetAsset: FLASH_WETH_ASSET
    })
  ).rejects.toThrow('Unavailable.')
  await trade.prepare({ operationId: 'operation-1', quoteId: 'quote-1', action: 'approve' })
  await trade.submit({ operationId: 'operation-1', quoteId: 'quote-1' })
  await trade.cancel({ operationId: 'operation-1' })
  await trade.close()
  await trade.hydrateTokenImage('1:0x1111111111111111111111111111111111111111')

  expect(host.executeQuery.mock.calls[0]?.[0]).toEqual({
    type: 'flash.quote',
    request: {
      contraAsset: FLASH_USDC_ASSET,
      inputAmount: '1',
      orderType: FLASH_MARKET_ORDER_TYPE,
      qty: '1',
      side: 'sell',
      targetAsset: FLASH_WETH_ASSET
    }
  })
  expect(host.executeCommand.mock.calls).toEqual(
    [
      { type: 'request.create', operationId: 'operation-1', quoteId: 'quote-1', action: 'approve' },
      { type: 'trade.submit', operationId: 'operation-1', quoteId: 'quote-1' },
      { type: 'operation.cancel', operationId: 'operation-1' },
      { type: 'sidetray.close' },
      { type: 'token.image-hydrate', tokenId: '1:0x1111111111111111111111111111111111111111' }
    ].map((command) => [command])
  )
})
