import { afterEach, beforeEach, describe, expect, it, jest } from 'bun:test'

import {
  buildFlashQuoteBody,
  buildFlashSubmitBody,
  createFlashService,
  flashBaseUrl,
  flashHeaders,
  normalizeFlashQuoteResponse
} from '../../../main/flash'
import type { FlashQuoteRequest } from '../../../main/flash/contracts'
import {
  FLASH_BASE_USDC_ADDRESS,
  FLASH_BASE_WETH_ADDRESS,
  FLASH_MARKET_ORDER_TYPE
} from '../../../resources/domain/flash/constants'
import {
  FLASH_NATIVE_ETH_ASSET,
  FLASH_USDC_ASSET,
  FLASH_WETH_ASSET
} from '../../../resources/domain/flash/assets'

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

function officialAssetRef({ address, id, name, ticker }: Record<string, string>) {
  return {
    id,
    name,
    address,
    ticker,
    chain: {
      id: 'eip155:8453',
      name: 'base',
      namespace: 'eip155'
    }
  }
}

function officialOrder(overrides: Record<string, unknown> = {}) {
  return {
    orderId: '00000000-0000-4000-8000-000000000001',
    orderType: 'limit',
    side: 'sell',
    status: 'ORDER_STATUS_PARTIALLY_FILLED',
    closeReason: null,
    funderAddress: '0x0000000000000000000000000000000000000001',
    targetAsset: officialAssetRef({
      address: FLASH_BASE_WETH_ADDRESS,
      id: 'flash-base-weth',
      name: 'Wrapped Ether',
      ticker: 'WETH'
    }),
    contraAsset: officialAssetRef({
      address: FLASH_BASE_USDC_ADDRESS,
      id: 'flash-base-usdc',
      name: 'USD Coin',
      ticker: 'USDC'
    }),
    qty: '1',
    filled: {
      targetAmount: '1',
      contraAmount: '2398.08',
      averagePrice: '2398.08',
      averageNotionalPrice: '2400'
    },
    limitNotionalPrice: '2500',
    trigger: null,
    brackets: null,
    maxPriceImpact: '0.05',
    twapBucketCount: null,
    placedAt: '2026-07-14T08:00:00.000Z',
    acceptedAt: '2026-07-14T08:01:00.000Z',
    closedAt: null,
    ...overrides
  }
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
    const body = buildFlashQuoteBody(quoteRequest())

    expect(body).toMatchObject({
      funderAddress: '0x0000000000000000000000000000000000000001',
      targetChain: 'anvil',
      contraChain: 'anvil',
      targetAsset: FLASH_WETH_ASSET.address.toLowerCase(),
      contraAsset: FLASH_USDC_ASSET.address.toLowerCase(),
      side: 'sell',
      qty: '1',
      orderType: 'market',
      maxSlippage: '0.005'
    })
    expect(body).not.toHaveProperty('inputAmount')
    expect(body).not.toHaveProperty('slippage')
  })

  it('maps advanced fields to current Flash types and trigger schema', () => {
    const triggerBody = buildFlashQuoteBody({
      ...quoteRequest(),
      expireTime: '2026-08-01T00:00:00Z',
      limitNotionalPrice: '1700',
      maxPriceImpact: '5',
      orderType: 'stop-loss',
      stopLossNotionalPrice: '1750'
    })

    expect(triggerBody).toMatchObject({
      expireTime: '2026-08-01T00:00:00Z',
      limitNotionalPrice: '1700',
      maxPriceImpact: '0.05',
      triggers: [{ notionalPrice: '1750', triggerType: 'lower' }]
    })
    expect(triggerBody).not.toHaveProperty('stopLossNotionalPrice')

    const twapBody = buildFlashQuoteBody({
      ...quoteRequest(),
      durationSeconds: '300',
      limitNotionalPrice: '1700',
      maxPriceImpact: '2.5',
      orderType: 'twap',
      twapBucketCount: '12'
    })

    expect(twapBody).toMatchObject({
      durationSeconds: 300,
      maxPriceImpact: '0.025',
      twapBucketCount: 12
    })
    expect(twapBody).not.toHaveProperty('limitNotionalPrice')
  })

  it('omits unset protections while preserving an explicit zero', () => {
    const omitted = buildFlashQuoteBody({
      ...quoteRequest(),
      limitNotionalPrice: '2500',
      maxPriceImpact: undefined,
      orderType: 'limit',
      slippage: undefined
    })
    const zero = buildFlashQuoteBody({
      ...quoteRequest(),
      maxPriceImpact: '0',
      slippage: '0'
    })

    expect(omitted).not.toHaveProperty('maxSlippage')
    expect(omitted).not.toHaveProperty('maxPriceImpact')
    expect(zero).toMatchObject({ maxSlippage: '0', maxPriceImpact: '0' })
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
    const orderTypedData = {
      domain: { chainId: 31337 },
      primaryType: 'Order',
      types: { Order: [] },
      message: { quoteId: 'quote-1' }
    }
    const quote = normalizeFlashQuoteResponse(
      {
        quoteId: 'quote-1',
        from: { asset: 'target', amount: '1', notional: '2400' },
        to: { asset: 'contra', amount: '2398.08', notional: '2398.08' },
        fees: { estimatedFeeNotional: '1.92' },
        evm: {
          approveTx: {
            to: FLASH_WETH_ASSET.address,
            data: '0x095ea7b3'
          },
          orderTypedData: JSON.stringify(orderTypedData)
        }
      },
      quoteRequest()
    )

    expect(quote.id).toBe('quote-1')
    expect(quote.spentAsset.symbol).toBe('WETH')
    expect(quote.receiveAsset.symbol).toBe('USDC')
    expect(quote.inputAmount).toBe('1')
    expect(quote.inputNotional).toBe('2400')
    expect(quote.outputAmount).toBe('2398.08')
    expect(quote.outputNotional).toBe('2398.08')
    expect(quote.fees).toEqual([{ label: 'Estimated fee (USD)', amount: '1.92' }])
    expect(quote.actions?.approval?.tx.to).toBe(FLASH_WETH_ASSET.address)
    expect(quote.steps.map((step) => step.kind)).toEqual(['approve', 'sign', 'submit'])
    expect((quote.raw as any).evm.orderTypedData).toEqual(orderTypedData)
    expect((quote.raw as any).evm.orderTypedDataRaw).toBe(JSON.stringify(orderTypedData))
  })

  it('echoes current trade fields and serialized EVM typed data when submitting', () => {
    const orderTypedData = {
      domain: { chainId: 31337 },
      primaryType: 'Order',
      types: { Order: [] },
      message: { quoteId: 'submit-quote' }
    }
    const orderTypedDataRaw = ` ${JSON.stringify(orderTypedData)} `
    const permitTypedDataRaw = `\n${JSON.stringify({ ...orderTypedData, primaryType: 'Permit' })}\n`
    const request = quoteRequest()
    const quote = normalizeFlashQuoteResponse(
      {
        quoteId: 'submit-quote',
        from: { asset: 'target', amount: '1', notional: '2400' },
        to: { asset: 'contra', amount: '2398.08', notional: '2398.08' },
        fees: { estimatedFeeNotional: '1.92' },
        evm: { orderTypedData: orderTypedDataRaw, permitTypedData: permitTypedDataRaw }
      },
      request
    )
    const body = buildFlashSubmitBody({
      ...request,
      evmPermitSignature: '0xpermit',
      orderSignature: '0xsignature',
      quote
    })

    expect(body).toMatchObject({
      targetChain: 'anvil',
      contraChain: 'anvil',
      targetAsset: FLASH_WETH_ASSET.address.toLowerCase(),
      contraAsset: FLASH_USDC_ASSET.address.toLowerCase(),
      side: 'sell',
      qty: '1',
      orderType: 'market',
      funderAddress: request.accountAddress,
      maxSlippage: '0.005',
      quoteId: 'submit-quote',
      userSignature: '0xsignature',
      evmOrderTypedData: orderTypedDataRaw,
      evmPermitTypedData: permitTypedDataRaw,
      evmPermitSignature: '0xpermit'
    })
    expect(body).not.toHaveProperty('rawQuote')
    expect(body).not.toHaveProperty('inputAmount')
  })

  it('omits quote-only expiry fields from limit and TWAP submits', () => {
    const typedData = JSON.stringify({ domain: { chainId: 31337 }, types: {}, message: {} })
    const limitRequest = {
      ...quoteRequest(),
      expireTime: '2030-01-02T03:04:05.000Z',
      limitNotionalPrice: '2500',
      orderType: 'limit' as const
    }
    const twapRequest = {
      ...quoteRequest(),
      durationSeconds: 300,
      maxPriceImpact: '5',
      orderType: 'twap' as const,
      twapBucketCount: 12
    }
    const response = {
      quoteId: 'advanced-submit-quote',
      from: { asset: 'target', amount: '1', notional: '2400' },
      to: { asset: 'contra', amount: '2398.08', notional: '2398.08' },
      fees: { estimatedFeeNotional: '1.92' },
      evm: { orderTypedData: typedData }
    }
    const limitBody = buildFlashSubmitBody({
      ...limitRequest,
      orderSignature: '0xlimit',
      quote: normalizeFlashQuoteResponse(response, limitRequest)
    })
    const twapBody = buildFlashSubmitBody({
      ...twapRequest,
      orderSignature: '0xtwap',
      quote: normalizeFlashQuoteResponse(response, twapRequest)
    })

    expect(limitBody).not.toHaveProperty('expireTime')
    expect(twapBody).not.toHaveProperty('durationSeconds')
    expect(twapBody).toMatchObject({ twapBucketCount: 12, maxPriceImpact: '0.05' })
  })

  it('submits the wrapped asset when the quote spends native ETH', () => {
    const request = {
      ...quoteRequest(),
      targetAsset: FLASH_NATIVE_ETH_ASSET
    }
    const quote = normalizeFlashQuoteResponse(
      {
        quoteId: 'native-submit-quote',
        targetAsset: FLASH_WETH_ASSET.address,
        contraAsset: FLASH_USDC_ASSET.address,
        from: { asset: 'target', amount: '1', notional: '2400' },
        to: { asset: 'contra', amount: '2398.08', notional: '2398.08' },
        fees: { estimatedFeeNotional: '1.92' },
        wrap: {
          nativeAsset: FLASH_NATIVE_ETH_ASSET.address,
          wrappedAsset: FLASH_WETH_ASSET.address,
          evmTx: { to: FLASH_WETH_ASSET.address, data: '0xd0e30db0', value: '0xde0b6b3a7640000' }
        },
        evm: {
          approveTx: { to: FLASH_WETH_ASSET.address, data: '0x095ea7b3' },
          orderTypedData: JSON.stringify({ domain: { chainId: 31337 }, types: {}, message: {} })
        }
      },
      request
    )
    const body = buildFlashSubmitBody({
      ...request,
      orderSignature: '0xsignature',
      quote
    })

    expect(body.targetAsset).toBe(FLASH_WETH_ASSET.address)
    expect(body.targetAsset).not.toBe(FLASH_NATIVE_ETH_ASSET.address)
    expect(body.contraAsset).toBe(FLASH_USDC_ASSET.address)
    expect(quote.actions?.approval?.asset.symbol).toBe('WETH')
    expect(quote.actions?.approval?.label).toBe('Approve WETH')
  })

  it('normalizes official root order assets, qty, fills, and timestamps from list responses', async () => {
    const flash = createFlashService()
    const originalFetch = globalThis.fetch
    const fetchMock = jest.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response(JSON.stringify({ orders: [officialOrder()] }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    try {
      const result = await flash.listOrders({
        accountAddress: '0x0000000000000000000000000000000000000001',
        pageSize: 250,
        status: ['partially-filled', 'ORDER_STATUS_CANCELLED']
      })
      const order = result.orders[0]
      const url = new URL(String(fetchMock.mock.calls[0]?.[0]))

      expect(url.pathname).toBe('/v1/orders')
      expect(url.searchParams.get('funderAddress')).toBe('0x0000000000000000000000000000000000000001')
      expect(url.searchParams.get('statuses')).toBe('ORDER_STATUS_PARTIALLY_FILLED,ORDER_STATUS_CANCELLED')
      expect(url.searchParams.get('pageSize')).toBe('200')
      expect(url.searchParams.has('chain')).toBe(false)
      expect(order).toMatchObject({
        chainId: 8453,
        status: 'partially-filled',
        qty: '1',
        spentAmount: '1',
        outputAmount: '2398.08',
        filledOutputAmount: '2398.08',
        averageFillPrice: '2400',
        createdAt: Date.parse('2026-07-14T08:00:00.000Z'),
        updatedAt: Date.parse('2026-07-14T08:01:00.000Z'),
        targetAsset: {
          id: `8453:${FLASH_BASE_WETH_ADDRESS.toLowerCase()}`,
          symbol: 'WETH',
          decimals: 18,
          chainId: 8453
        },
        contraAsset: {
          id: `8453:${FLASH_BASE_USDC_ADDRESS.toLowerCase()}`,
          symbol: 'USDC',
          decimals: 6,
          chainId: 8453
        },
        spentAsset: { symbol: 'WETH' },
        receiveAsset: { symbol: 'USDC' }
      })
    } finally {
      flash.dispose()
      globalThis.fetch = originalFetch
    }
  })

  it('uses official get and cancel request shapes with root order responses', async () => {
    const flash = createFlashService()
    const originalFetch = globalThis.fetch
    const orderId = '00000000-0000-4000-8000-000000000002'
    const accountAddress = '0x0000000000000000000000000000000000000002'
    const responses = [
      {
        order: officialOrder({
          orderId,
          funderAddress: accountAddress,
          side: 'buy',
          qty: '100',
          filled: {
            targetAmount: '0.041',
            contraAmount: '100',
            averagePrice: '2439.02439',
            averageNotionalPrice: '2439.02'
          }
        }),
        fills: []
      },
      { ok: true }
    ]
    const fetchMock = jest.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      const payload = responses.shift()
      if (!payload) throw new Error('Unexpected Flash request')

      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      })
    })
    globalThis.fetch = fetchMock as unknown as typeof fetch

    try {
      const detail = await flash.getOrder({ accountAddress, orderId })
      const getUrl = new URL(String(fetchMock.mock.calls[0]?.[0]))

      expect(getUrl.pathname).toBe(`/v1/orders/${orderId}`)
      expect(getUrl.searchParams.get('funderAddress')).toBe(accountAddress)
      expect(detail.order).toMatchObject({
        side: 'buy',
        qty: '100',
        spentAmount: '100',
        filledOutputAmount: '0.041',
        averageFillPrice: '2439.02',
        spentAsset: { symbol: 'USDC' },
        receiveAsset: { symbol: 'WETH' }
      })

      const cancelled = await flash.cancelOrder({ orderId, signature: '0xcancel-signature' })
      const cancelUrl = new URL(String(fetchMock.mock.calls[1]?.[0]))
      const cancelInit = fetchMock.mock.calls[1]?.[1] as RequestInit

      expect(cancelUrl.pathname).toBe(`/v1/orders/${orderId}/cancel`)
      expect(JSON.parse(String(cancelInit.body))).toEqual({
        cancelMessage: `Definitive Flash v1 — Cancel Order\nOrder: ${orderId}`,
        userSignature: '0xcancel-signature'
      })
      expect(cancelled.order.status).toBe('cancelled')
    } finally {
      flash.dispose()
      globalThis.fetch = originalFetch
    }
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
    const flash = createFlashService({ positionSync: { track, refresh } })

    try {
      await flash.submitOrder({
        ...request,
        accountAddress: request.accountAddress,
        quote,
        quoteId: quote.id,
        idempotencyKey: quote.id,
        signature: '0xsignature'
      })

      expect(globalThis.fetch).toHaveBeenNthCalledWith(
        1,
        expect.any(URL),
        expect.objectContaining({
          headers: expect.objectContaining({ 'Idempotency-Key': quote.id })
        })
      )

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

      await flash.getOrder({ orderId })
      expect(refresh).toHaveBeenCalledTimes(1)

      await flash.getOrder({ orderId })
      expect(refresh).toHaveBeenCalledTimes(1)

      await flash.getOrder({ orderId })
      expect(refresh).toHaveBeenCalledTimes(2)

      await flash.getOrder({ orderId })
      expect(refresh).toHaveBeenCalledTimes(3)
      expect(refresh).toHaveBeenLastCalledWith(
        expect.objectContaining({
          address: request.accountAddress,
          chainId: 31337
        })
      )
    } finally {
      flash.dispose()
      globalThis.fetch = originalFetch
    }
  })
})
