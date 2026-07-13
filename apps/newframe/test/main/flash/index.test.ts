import { afterEach, beforeEach, describe, expect, it, jest } from 'bun:test'

import {
  buildFlashQuoteBody,
  flashBaseUrl,
  flashHeaders,
  getOrder,
  normalizeFlashQuoteResponse,
  setFlashPositionSync,
  stopOpenOrderPolling,
  submitOrder
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

  it('adds packaged auth only for non-dev requests', () => {
    process.env.FRAME_PROFILE = 'dev' as any
    expect(flashHeaders()['x-definitive-api-key']).toBeUndefined()

    process.env.FRAME_PROFILE = 'prod' as any
    expect(flashHeaders()['x-definitive-api-key']).toBe('dpka_513a2bd7_57a2_46d2_927b_2a3857fe271b')
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

  it('tracks submitted order assets and refreshes positions on partial fills and terminal states', async () => {
    const request = { ...quoteRequest(), orderType: 'limit' as const }
    const quote = normalizeFlashQuoteResponse(
      {
        quoteId: 'position-quote',
        inputAmount: '1',
        outputAmount: '2398.08',
        evm: { orderTypedData: { domain: { chainId: 31337 }, types: {}, message: {} } }
      },
      request
    )
    const orderId = 'position-order'
    const orderResponse = (status: string, filledOutputAmount?: string) => ({
      orderId,
      status,
      filledOutputAmount,
      quote: {
        quoteId: quote.id,
        side: quote.side,
        orderType: quote.orderType,
        targetAsset: quote.targetAsset,
        contraAsset: quote.contraAsset,
        inputAmount: quote.inputAmount,
        outputAmount: quote.outputAmount
      }
    })
    const responses = [
      { orderId, status: 'accepted' },
      orderResponse('partially_filled', '1000'),
      orderResponse('partially_filled', '1000'),
      orderResponse('partially_filled', '1500'),
      orderResponse('cancelled', '1500')
    ]
    const originalFetch = globalThis.fetch
    const track = jest.fn()
    const refresh = jest.fn()

    globalThis.fetch = jest.fn(async () => {
      const payload = responses.shift()
      if (!payload) throw new Error('Unexpected Flash request')

      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    }) as unknown as typeof fetch
    setFlashPositionSync({ track, refresh })

    try {
      await submitOrder({
        ...request,
        accountAddress: request.accountAddress,
        quote,
        quoteId: quote.id,
        signature: '0xsignature'
      })

      expect(track).toHaveBeenCalledTimes(1)
      expect(track).toHaveBeenCalledWith({
        address: request.accountAddress,
        chainId: 31337,
        tokens: [
          {
            address: FLASH_WETH_ASSET.address.toLowerCase(),
            chainId: 31337,
            decimals: 18,
            name: 'Wrapped Ether',
            symbol: 'WETH'
          },
          {
            address: FLASH_USDC_ASSET.address.toLowerCase(),
            chainId: 31337,
            decimals: 6,
            name: 'USD Coin',
            symbol: 'USDC'
          }
        ]
      })
      expect(refresh).not.toHaveBeenCalled()

      await getOrder({ orderId })
      expect(refresh).toHaveBeenCalledTimes(1)

      await getOrder({ orderId })
      expect(refresh).toHaveBeenCalledTimes(1)

      await getOrder({ orderId })
      expect(refresh).toHaveBeenCalledTimes(2)

      await getOrder({ orderId })
      expect(refresh).toHaveBeenCalledTimes(3)
      expect(refresh).toHaveBeenLastCalledWith(
        expect.objectContaining({
          address: request.accountAddress,
          chainId: 31337
        })
      )
    } finally {
      stopOpenOrderPolling()
      setFlashPositionSync()
      globalThis.fetch = originalFetch
    }
  })
})
