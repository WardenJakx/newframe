import { expect, it } from 'bun:test'

import { FLASH_USDC_ASSET, FLASH_WETH_ASSET, getFlashAssetsForChain } from './assets'
import { FLASH_ANVIL_CHAIN_ID, FLASH_MARKET_ORDER_TYPE } from './constants'
import type { FlashQuote, FlashQuoteAction } from './schemas'
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

it('derives cross-chain provider fields and every execution chain from the spent asset', () => {
  const targetAsset = getFlashAssetsForChain(1).find((asset) => asset.symbol === 'WETH')!
  const contraAsset = getFlashAssetsForChain(8453).find((asset) => asset.symbol === 'USDC')!
  const typedData = {
    domain: { chainId: 8453 },
    message: { toToken: '0x000000000000000000000000000000000DEFdeaD' },
    primaryType: 'Order',
    types: { Order: [] }
  }
  const quote = {
    id: '',
    side: 'buy',
    orderType: FLASH_MARKET_ORDER_TYPE,
    targetAsset,
    contraAsset,
    spentAsset: contraAsset,
    receiveAsset: targetAsset,
    inputAmount: '100',
    outputAmount: '0.04',
    steps: [],
    raw: { bridgeQuoteId: 'bridge-1', evm: { orderTypedData: typedData } }
  } satisfies FlashQuote
  expect(
    buildFlashSubmitRequest({
      accountAddress: '0x1111111111111111111111111111111111111111',
      bridgeQuoteId: 'bridge-1',
      flashPayload: quote.raw,
      idempotencyKey: 'operation-cross-chain',
      orderSignature: '0xorder',
      quote,
      quoteRequest: { recipientAddress: '0x2222222222222222222222222222222222222222' }
    })
  ).toMatchObject({
    accountAddress: '0x1111111111111111111111111111111111111111',
    recipientAddress: '0x1111111111111111111111111111111111111111',
    targetChain: 'ethereum',
    contraChain: 'base',
    bridgeQuoteId: 'bridge-1',
    evmOrderTypedData: JSON.stringify(typedData)
  })

  const baseAction = {
    id: 'approve',
    kind: 'approve',
    label: 'Approve USDC',
    asset: contraAsset,
    amount: '100',
    amountRaw: '100000000',
    tx: { to: contraAsset.address, data: '0x095ea7b3' }
  } as unknown as FlashQuoteAction
  expect(buildFlashActionTransaction(baseAction, 8453).chainId).toBe(8453)
  expect(() =>
    buildFlashActionTransaction({ ...baseAction, tx: { ...baseAction.tx, chainId: 1 } }, 8453)
  ).toThrow('Invalid Flash action chain id')
  expect(flashTypedDataChainId(typedData, 1)).toBe(8453)
})
