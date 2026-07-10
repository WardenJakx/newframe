import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import {
  buildFlashQuoteBody,
  flashBaseUrl,
  flashHeaders,
  normalizeFlashQuoteResponse
} from '../../../main/flash'
import type { FlashQuoteRequest } from '../../../main/flash'
import { FLASH_MARKET_ORDER_TYPE, FLASH_USDC_ASSET, FLASH_WETH_ASSET } from '../../../resources/domain/flash'

const originalEnv = { ...process.env }

function quoteRequest() {
  return {
    accountAddress: '0x0000000000000000000000000000000000000001',
    chainId: 31337,
    contraAsset: FLASH_USDC_ASSET,
    inputAmount: '1',
    orderType: FLASH_MARKET_ORDER_TYPE,
    qty: '1',
    side: 'sell' as const,
    slippage: '0.50',
    targetAsset: FLASH_WETH_ASSET
  } satisfies FlashQuoteRequest
}

describe('main Flash facade helpers', () => {
  beforeEach(() => {
    process.env.FRAME_PROFILE = 'dev' as any
    delete process.env.FLASH_API_KEY
  })

  afterEach(() => {
    process.env = { ...originalEnv }
  })

  it('selects local and production endpoints by FRAME_PROFILE', () => {
    process.env.FRAME_PROFILE = 'dev' as any
    expect(flashBaseUrl()).toBe('http://127.0.0.1:8422/v1')

    process.env.FRAME_PROFILE = 'prod' as any
    expect(flashBaseUrl()).toBe('https://flash.definitive.fi/v1')
  })

  it('adds auth only for non-dev requests and fails clearly without an API key', () => {
    process.env.FRAME_PROFILE = 'dev' as any
    expect(flashHeaders()['x-definitive-api-key']).toBeUndefined()

    process.env.FRAME_PROFILE = 'prod' as any
    expect(() => flashHeaders()).toThrow('FLASH_API_KEY is required')

    process.env.FLASH_API_KEY = 'flash_test_key'
    expect(flashHeaders()['x-definitive-api-key']).toBe('flash_test_key')
  })

  it('maps app quote payloads to Flash REST quote bodies', () => {
    expect(buildFlashQuoteBody(quoteRequest())).toMatchObject({
      funderAddress: '0x0000000000000000000000000000000000000001',
      targetChain: 'anvil',
      contraChain: 'anvil',
      targetAsset: FLASH_WETH_ASSET.address.toLowerCase(),
      contraAsset: FLASH_USDC_ASSET.address.toLowerCase(),
      side: 'sell',
      qty: '1',
      inputAmount: '1',
      orderType: 'market',
      slippage: '0.005'
    })
  })

  it('accepts mainnet when the packaged runtime has no explicit environment', () => {
    delete (process.env as Partial<NodeJS.ProcessEnv>).NODE_ENV
    delete (process.env as Partial<NodeJS.ProcessEnv>).FRAME_PROFILE

    const request: FlashQuoteRequest = quoteRequest()
    request.chainId = 1
    request.targetAsset = { ...FLASH_WETH_ASSET, chainId: 1, id: `1:${FLASH_WETH_ASSET.address}` }
    request.contraAsset = { ...FLASH_USDC_ASSET, chainId: 1, id: `1:${FLASH_USDC_ASSET.address}` }

    expect(buildFlashQuoteBody(request)).toMatchObject({
      targetChain: 'ethereum',
      contraChain: 'ethereum'
    })
  })

  it('normalizes Flash REST quote responses into renderer quote shape', () => {
    const quote = normalizeFlashQuoteResponse(
      {
        quoteId: 'quote-1',
        inputAmount: '1',
        outputAmount: '2398.08',
        evm: {
          approveTx: {
            chainId: 31337,
            to: FLASH_WETH_ASSET.address,
            data: '0x095ea7b3',
            value: '0x0'
          },
          orderTypedData: {
            domain: { chainId: 31337 },
            primaryType: 'Order',
            types: { Order: [] },
            message: { quoteId: 'quote-1' }
          }
        }
      },
      quoteRequest()
    )

    expect(quote.id).toBe('quote-1')
    expect(quote.spentAsset.symbol).toBe('WETH')
    expect(quote.receiveAsset.symbol).toBe('USDC')
    expect(quote.outputAmount).toBe('2398.08')
    expect(quote.actions?.approval?.tx.to).toBe(FLASH_WETH_ASSET.address)
    expect(quote.steps.map((step) => step.kind)).toEqual(['approve', 'sign', 'submit'])
  })
})
