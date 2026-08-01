import { expect, it } from 'bun:test'

import { FLASH_USDC_ASSET, FLASH_WETH_ASSET } from './assets'
import { FLASH_ANVIL_CHAIN_ID, FLASH_MARKET_ORDER_TYPE } from './constants'
import type { FlashQuote } from './schemas'
import {
  buildFlashActionTransaction,
  buildFlashSubmitRequest,
  findFlashTypedData,
  flashTypedDataChainId,
  parseFlashTypedData
} from './execution'

it('builds quoted actions and signature-bearing Flash submission data only in the portable execution layer', () => {
  const typedData = {
    domain: { chainId: FLASH_ANVIL_CHAIN_ID },
    message: { quoteId: 'quote-1' },
    primaryType: 'Order',
    types: { Order: [] }
  }
  const permitTypedData = {
    domain: { chainId: FLASH_ANVIL_CHAIN_ID },
    message: { permitted: true },
    primaryType: 'Permit',
    types: { Permit: [] }
  }
  const orderTypedDataRaw = ` ${JSON.stringify(typedData, null, 2)} `
  const permitTypedDataRaw = `\n${JSON.stringify(permitTypedData)}\n`
  const flashPayload = {
    evm: { orderTypedData: typedData, orderTypedDataRaw, permitTypedData, permitTypedDataRaw }
  }
  const quote = {
    id: 'quote-1',
    side: 'sell',
    orderType: FLASH_MARKET_ORDER_TYPE,
    targetAsset: FLASH_WETH_ASSET,
    contraAsset: FLASH_USDC_ASSET,
    spentAsset: FLASH_WETH_ASSET,
    receiveAsset: FLASH_USDC_ASSET,
    inputAmount: '1',
    outputAmount: '2400',
    steps: [],
    actions: {
      approval: {
        id: 'approval',
        kind: 'approve',
        label: 'Approve WETH',
        asset: FLASH_WETH_ASSET,
        amount: '1',
        amountRaw: '1000000000000000000',
        tx: {
          chainId: FLASH_ANVIL_CHAIN_ID,
          to: '0x0000000000000000000000000000000000000001',
          data: '0x095ea7b3'
        }
      }
    }
  } satisfies FlashQuote

  expect(buildFlashActionTransaction(quote.actions.approval!, FLASH_ANVIL_CHAIN_ID)).toEqual({
    chainId: FLASH_ANVIL_CHAIN_ID,
    transaction: {
      to: '0x0000000000000000000000000000000000000001',
      data: '0x095ea7b3',
      value: '0x0'
    }
  })
  expect(parseFlashTypedData(findFlashTypedData(quote, flashPayload, 'orderTypedDataRaw'))).toEqual(typedData)
  expect(flashTypedDataChainId(typedData, 1)).toBe(FLASH_ANVIL_CHAIN_ID)
  expect(() =>
    buildFlashSubmitRequest({
      accountAddress: '0xsender',
      flashPayload,
      idempotencyKey: 'operation-1',
      orderSignature: '0xorder',
      quote,
      quoteId: 'quote-1',
      quoteRequest: {}
    })
  ).toThrow('Flash quote requires a permit signature.')
  expect(
    buildFlashSubmitRequest({
      accountAddress: '0xsender',
      flashPayload,
      idempotencyKey: 'operation-1',
      orderSignature: '0xorder',
      permitSignature: '0xpermit',
      quote,
      quoteId: 'quote-1',
      quoteRequest: {}
    })
  ).toMatchObject({
    evmOrderTypedData: orderTypedDataRaw,
    evmPermitSignature: '0xpermit',
    evmPermitTypedData: permitTypedDataRaw,
    orderSignature: '0xorder'
  })
})
