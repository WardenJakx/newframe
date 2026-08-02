import { afterEach, beforeEach, describe, expect, it, mock } from 'bun:test'
import { EventEmitter } from 'node:events'
import WebSocket from 'ws'
import {
  buildFlashQuoteBody,
  buildFlashSubmitBody,
  createFlashService,
  flashBaseUrl,
  flashHeaders,
  flashWebSocketUrl,
  normalizeFlashQuoteResponse
} from './index'
import store from '../store'
import createCanonicalStore from '../store/createCanonicalStore'
import type { FlashQuoteRequest } from './contracts'
import {
  FLASH_BASE_USDC_ADDRESS,
  FLASH_BASE_WETH_ADDRESS,
  FLASH_MARKET_ORDER_TYPE
} from '../../domain/flash/constants'
import { FLASH_NATIVE_ETH_ASSET, FLASH_USDC_ASSET, FLASH_WETH_ASSET } from '../../domain/flash/assets'
import { NATIVE_CURRENCY } from '../../domain/token/constants'
const originalEnv = { ...process.env }
const originalFetch = globalThis.fetch
const assetRateService = { observe: mock() }
const accountAddress = '0x0000000000000000000000000000000000000001'
const services: ReturnType<typeof createFlashService>[] = []
const baseWireFields = {
  funderAddress: accountAddress,
  targetChain: 'anvil',
  contraChain: 'anvil',
  targetAsset: FLASH_WETH_ASSET.address.toLowerCase(),
  contraAsset: FLASH_USDC_ASSET.address.toLowerCase(),
  side: 'sell',
  qty: '1',
  orderType: 'market',
  maxSlippage: '0.005'
}
const jsonHeaders = { 'content-type': 'application/json' }
const jsonResponse = (payload: unknown, status = 200, statusText?: string) =>
  new Response(JSON.stringify(payload), { status, statusText, headers: jsonHeaders })
const queuedJsonResponses = (payloads: unknown[]) => {
  return async () => {
    const payload = payloads.shift()
    if (payload === undefined) throw new Error('Unexpected Flash request')
    return jsonResponse(payload)
  }
}
function installFetch(implementation: any) {
  const fetchMock = mock(implementation)
  globalThis.fetch = fetchMock as unknown as typeof fetch
  return fetchMock
}
function flashWithFetch(implementation: any, overrides: Record<string, unknown> = {}) {
  const fetchMock = installFetch(implementation)
  const flash = createFlashService({ assetRateService, store, ...overrides })
  services.push(flash)
  return { fetchMock, flash }
}
class FakeFlashWebSocket extends EventEmitter {
  readyState: number = WebSocket.CONNECTING
  open() {
    this.readyState = WebSocket.OPEN
    this.emit('open')
  }
  receive(payload: unknown) {
    this.emit('message', Buffer.from(JSON.stringify(payload)))
  }
  send(_message: string) {
    return
  }
  close() {
    if (this.readyState >= WebSocket.CLOSING) return
    this.readyState = WebSocket.CLOSED
    this.emit('close')
  }
}
const quoteRequest = () =>
  ({
    accountAddress,
    chainId: 31337,
    contraAsset: FLASH_USDC_ASSET,
    inputAmount: '1',
    orderType: FLASH_MARKET_ORDER_TYPE,
    qty: '1',
    side: 'sell' as const,
    slippage: '0.50',
    targetAsset: FLASH_WETH_ASSET
  }) satisfies FlashQuoteRequest
const quoteResponse = (overrides: Record<string, unknown> = {}) => ({
  quoteId: 'quote-1',
  from: { asset: 'target', amount: '1', notional: '2400' },
  to: { asset: 'contra', amount: '2398.08', notional: '2398.08' },
  fees: { estimatedFeeNotional: '1.92' },
  ...overrides
})
const rateResponse = (targetAmount: string, targetNotional: string, contraNotional: string) => ({
  from: { asset: 'target', amount: targetAmount, notional: targetNotional },
  to: { asset: 'contra', amount: '1200', notional: contraNotional }
})
const normalizedQuote = (
  response: Record<string, unknown> = {},
  request: FlashQuoteRequest = quoteRequest()
) => normalizeFlashQuoteResponse(quoteResponse(response), request)
function submitFixture(
  requestOverrides: Partial<FlashQuoteRequest>,
  responseOverrides: Record<string, unknown>,
  submitOverrides: Record<string, unknown> = {}
) {
  const request = { ...quoteRequest(), ...requestOverrides } as FlashQuoteRequest
  const quote = normalizedQuote(responseOverrides, request)
  return {
    body: buildFlashSubmitBody({ ...request, orderSignature: '0xsignature', quote, ...submitOverrides }),
    quote
  }
}
const orderTypedData = (quoteId?: string) =>
  quoteId
    ? { domain: { chainId: 31337 }, primaryType: 'Order', types: { Order: [] }, message: { quoteId } }
    : { domain: { chainId: 31337 }, types: {}, message: {} }
const officialAssetRef = (address: string, id: string, name: string, ticker: string) => ({
  id,
  name,
  address,
  ticker,
  chain: { id: 'eip155:8453', name: 'base', namespace: 'eip155' }
})
const officialFill = (
  targetAmount = '1',
  contraAmount = '2398.08',
  averagePrice = contraAmount,
  averageNotionalPrice = '2400'
) => ({ targetAmount, contraAmount, averagePrice, averageNotionalPrice })
const officialOrder = (overrides: Record<string, unknown> = {}) => ({
  orderId: '00000000-0000-4000-8000-000000000001',
  orderType: 'limit',
  side: 'sell',
  status: 'ORDER_STATUS_PARTIALLY_FILLED',
  funderAddress: accountAddress,
  targetAsset: officialAssetRef(FLASH_BASE_WETH_ADDRESS, 'flash-base-weth', 'Wrapped Ether', 'WETH'),
  contraAsset: officialAssetRef(FLASH_BASE_USDC_ADDRESS, 'flash-base-usdc', 'USD Coin', 'USDC'),
  qty: '1',
  filled: officialFill(),
  placedAt: '2026-07-14T08:00:00.000Z',
  acceptedAt: '2026-07-14T08:01:00.000Z',
  closedAt: null,
  ...overrides
})
const canonicalToken = (
  asset: { address: string; decimals: number; name: string; symbol: string },
  chainId: number
) => ({
  address: asset.address.toLowerCase(),
  chainId,
  decimals: asset.decimals,
  name: asset.name,
  symbol: asset.symbol
})
const canonicalAsset = (address: string, symbol: string, decimals: number) => ({
  id: `8453:${address.toLowerCase()}`,
  symbol,
  decimals,
  chainId: 8453
})
const sendOrders = (socket: FakeFlashWebSocket, type: 'snapshot' | 'update', ...orders: unknown[]) =>
  socket.receive({ channel: 'orders', type, orders })
const sendOfficialOrder = (
  socket: FakeFlashWebSocket,
  type: 'snapshot' | 'update',
  order: Record<string, unknown>
) => sendOrders(socket, type, officialOrder(order))

const startAgentSession = (
  flash: ReturnType<typeof createFlashService>,
  accountAddress: string,
  sessionId: string,
  ttl = 60_000
) => flash.startAgentSession({ accountAddress, expiresAt: Date.now() + ttl, sessionId })
describe('main Flash facade helpers', () => {
  beforeEach(() => {
    assetRateService.observe.mockClear()
    process.env.FRAME_PROFILE = 'dev' as any
  })
  afterEach(() => {
    for (const flash of services.splice(0)) flash.dispose()
    globalThis.fetch = originalFetch
    process.env = { ...originalEnv }
  })
  it.each([
    ['dev', 'http://127.0.0.1:8422/v1', 'ws://127.0.0.1:8422/v1/ws', undefined],
    [
      'prod',
      'https://flash.definitive.fi/v1',
      'wss://flash.definitive.fi/v1/ws',
      'dpka_513a2bd7_57a2_46d2_927b_2a3857fe271b'
    ]
  ])('uses %s endpoints and packaged auth', (profile, baseUrl, webSocketUrl, apiKey) => {
    process.env.FRAME_PROFILE = profile as any
    expect(flashBaseUrl()).toBe(baseUrl)
    expect(flashWebSocketUrl()).toBe(webSocketUrl)
    expect(flashHeaders()['x-definitive-api-key'] || undefined).toBe(apiKey)
  })
  it('maps app quote payloads to Flash REST quote bodies', () => {
    const body = buildFlashQuoteBody(quoteRequest())
    expect(body).toMatchObject(baseWireFields)
    expect(body).not.toHaveProperty('inputAmount')
    expect(body).not.toHaveProperty('slippage')
  })
  it('maps advanced fields and trigger schema while preserving protection omission semantics', () => {
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
      startTime: '2099-08-01T00:00:00Z',
      twapBucketCount: '12'
    })
    expect(twapBody).toMatchObject({
      durationSeconds: 300,
      limitNotionalPrice: '1700',
      maxPriceImpact: '0.025',
      startTime: '2099-08-01T00:00:00Z',
      twapBucketCount: 12
    })
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
  it('maps native assets to the Flash 0xeeee sentinel', () => {
    const body = buildFlashQuoteBody({
      ...quoteRequest(),
      targetAsset: FLASH_NATIVE_ETH_ASSET
    })
    expect(body.targetAsset).toBe('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee')
  })
  it('normalizes quote responses and preserves serialized typed data through submission', () => {
    const typedData = orderTypedData('quote-1')
    const quote = normalizedQuote({
      evm: {
        approveTx: { to: FLASH_WETH_ASSET.address, data: '0x095ea7b3' },
        orderTypedData: JSON.stringify(typedData)
      }
    })
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
    expect((quote.raw as any).evm.orderTypedData).toEqual(typedData)
    expect((quote.raw as any).evm.orderTypedDataRaw).toBe(JSON.stringify(typedData))
    const submitTypedData = orderTypedData('submit-quote')
    const orderTypedDataRaw = ` ${JSON.stringify(submitTypedData)} `
    const permitTypedDataRaw = `\n${JSON.stringify({ ...submitTypedData, primaryType: 'Permit' })}\n`
    const { body } = submitFixture(
      {},
      {
        quoteId: 'submit-quote',
        evm: { orderTypedData: orderTypedDataRaw, permitTypedData: permitTypedDataRaw }
      },
      { evmPermitSignature: '0xpermit' }
    )
    expect(body).toMatchObject({
      ...baseWireFields,
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
    const typedData = JSON.stringify(orderTypedData())
    const limitRequest = {
      ...quoteRequest(),
      expireTime: '2030-01-02T03:04:05.000Z',
      limitNotionalPrice: '2500',
      orderType: 'limit' as const
    }
    const twapRequest = {
      ...quoteRequest(),
      durationSeconds: 300,
      limitNotionalPrice: '2300',
      maxPriceImpact: '5',
      orderType: 'twap' as const,
      startTime: '2099-08-01T00:00:00Z',
      twapBucketCount: 12
    }
    const response = quoteResponse({
      quoteId: 'advanced-submit-quote',
      evm: { orderTypedData: typedData }
    })
    const limitBody = submitFixture(limitRequest, response, { orderSignature: '0xlimit' }).body
    const twapBody = submitFixture(twapRequest, response, { orderSignature: '0xtwap' }).body
    expect(limitBody).not.toHaveProperty('expireTime')
    expect(twapBody).not.toHaveProperty('durationSeconds')
    expect(twapBody).toMatchObject({
      limitNotionalPrice: '2300',
      maxPriceImpact: '0.05',
      startTime: '2099-08-01T00:00:00Z',
      twapBucketCount: 12
    })
  })
  it('submits the wrapped asset when the quote spends native ETH', () => {
    const { body, quote } = submitFixture(
      { targetAsset: FLASH_NATIVE_ETH_ASSET },
      {
        quoteId: 'native-submit-quote',
        targetAsset: FLASH_WETH_ASSET.address,
        contraAsset: FLASH_USDC_ASSET.address,
        wrap: {
          nativeAsset: FLASH_NATIVE_ETH_ASSET.address,
          wrappedAsset: FLASH_WETH_ASSET.address,
          evmTx: { to: FLASH_WETH_ASSET.address, data: '0xd0e30db0', value: '0xde0b6b3a7640000' }
        },
        evm: {
          approveTx: { to: FLASH_WETH_ASSET.address, data: '0x095ea7b3' },
          orderTypedData: JSON.stringify(orderTypedData())
        }
      }
    )
    expect(body.targetAsset).toBe(FLASH_WETH_ASSET.address)
    expect(body.targetAsset).not.toBe(FLASH_NATIVE_ETH_ASSET.address)
    expect(body.contraAsset).toBe(FLASH_USDC_ASSET.address)
    expect(quote.actions?.approval?.asset.symbol).toBe('WETH')
    expect(quote.actions?.approval?.label).toBe('Approve WETH')
  })
  it('includes the complete structured Flash error response in request errors', async () => {
    const payload = {
      error: {
        code: 'invalid_quote',
        details: [{ field: 'qty', issue: 'must be greater than zero' }],
        message: 'Quote validation failed'
      },
      requestId: 'request-123'
    }
    const { flash } = flashWithFetch(async () => jsonResponse(payload, 400, 'Bad Request'))
    expect(flash.quote(quoteRequest())).rejects.toThrow(
      `Flash API 400 Bad Request: ${JSON.stringify(payload)}`
    )
  })
  it('forwards every available normalized quote-leg rate in one canonical batch', async () => {
    const observe = mock()
    const responses = [
      rateResponse('2', '4800', '1200'),
      rateResponse('2', '4800', ''),
      rateResponse('0', '4800', '1200'),
      rateResponse('NaN', '4800', '-1')
    ]
    const nativeRate = { chainId: 31337, address: NATIVE_CURRENCY, usdRate: 2400 }
    const usdcRate = { chainId: 31337, address: FLASH_USDC_ASSET.address.toLowerCase(), usdRate: 1 }
    const { flash } = flashWithFetch(queuedJsonResponses(responses), { assetRateService: { observe } })
    const request = { ...quoteRequest(), targetAsset: FLASH_NATIVE_ETH_ASSET }
    await flash.quote(request)
    await flash.quote(request)
    await flash.quote(request)
    const invalidQuote = await flash.quote(request)
    expect(observe).toHaveBeenNthCalledWith(1, 'flash', [nativeRate, usdcRate])
    expect(observe).toHaveBeenNthCalledWith(2, 'flash', [nativeRate])
    expect(observe).toHaveBeenNthCalledWith(3, 'flash', [usdcRate])
    expect(observe).toHaveBeenCalledTimes(3)
    expect(invalidQuote.quote.inputAmount).toBe('NaN')
  })
  it('does not fail a successful quote when rate observation is discarded', async () => {
    const observe = mock(() => {
      throw new Error('discarded observation')
    })
    const { flash } = flashWithFetch(
      async () => jsonResponse(quoteResponse({ quoteId: 'best-effort-rate' })),
      {
        assetRateService: { observe }
      }
    )
    const result = await flash.quote(quoteRequest())
    expect(result.quote.id).toBe('best-effort-rate')
    expect(observe).toHaveBeenCalledTimes(1)
  })
  it('normalizes official root order assets, qty, fills, and timestamps from list responses', async () => {
    const { flash, fetchMock } = flashWithFetch(async () => jsonResponse({ orders: [officialOrder()] }))
    const result = await flash.listOrders({
      accountAddress,
      pageSize: 250,
      status: ['partially-filled', 'ORDER_STATUS_CANCELLED']
    })
    const order = result.orders[0]
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]))
    expect(url.pathname).toBe('/v1/orders')
    expect(url.searchParams.get('funderAddress')).toBe(accountAddress)
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
      targetAsset: canonicalAsset(FLASH_BASE_WETH_ADDRESS, 'WETH', 18),
      contraAsset: canonicalAsset(FLASH_BASE_USDC_ADDRESS, 'USDC', 6),
      spentAsset: { symbol: 'WETH' },
      receiveAsset: { symbol: 'USDC' }
    })
  })
  it('keeps persisted orders and notifications isolated across real Flash service graphs', async () => {
    const memoryStorage = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined }
    const firstStore = createCanonicalStore(memoryStorage).store
    const secondStore = createCanonicalStore(memoryStorage).store
    const firstOrderId = '00000000-0000-4000-8000-000000000011'
    const secondOrderId = '00000000-0000-4000-8000-000000000022'
    const responses = [
      officialOrder({
        orderId: firstOrderId,
        status: 'ORDER_STATUS_FILLED',
        closedAt: '2026-07-14T08:02:00.000Z'
      }),
      officialOrder({
        orderId: secondOrderId,
        funderAddress: '0x0000000000000000000000000000000000000002',
        status: 'ORDER_STATUS_REJECTED',
        closedAt: '2026-07-14T08:03:00.000Z'
      })
    ]
    installFetch(queuedJsonResponses(responses.map((order) => ({ orders: [order] }))))
    const firstFlash = createFlashService({ assetRateService, store: firstStore })
    const secondFlash = createFlashService({ assetRateService, store: secondStore })
    services.push(firstFlash, secondFlash)
    await firstFlash.listOrders({ accountAddress })
    await secondFlash.listOrders({ accountAddress: '0x0000000000000000000000000000000000000002' })
    for (const [ownStore, ownId, ownState, status, foreignId] of [
      [firstStore, firstOrderId, 'completed', 'filled', secondOrderId],
      [secondStore, secondOrderId, 'failed', 'rejected', firstOrderId]
    ] as const) {
      expect(Object.keys(ownStore.getState().main.orders)).toEqual([ownId])
      expect(ownStore.getState().view.notifications[`flash-order:${ownId}`]).toMatchObject({
        state: ownState,
        metadata: { orderId: ownId, status }
      })
      expect(ownStore.getState().view.notifications[`flash-order:${foreignId}`]).toBeUndefined()
    }
  })
  it('treats every undocumented non-open Flash status as terminal', async () => {
    const order = officialOrder({
      orderId: 'unknown-terminal-status',
      status: 'ORDER_STATUS_SETTLED',
      closedAt: '2026-07-14T08:02:00.000Z'
    })
    const { flash } = flashWithFetch(async () => jsonResponse({ orders: [order] }))
    const result = await flash.listOrders({ accountAddress })
    expect(result.orders[0]).toMatchObject({
      status: 'terminated',
      rawStatus: 'ORDER_STATUS_SETTLED',
      open: false
    })
  })
  it('uses official get and cancel request shapes with root order responses', async () => {
    const orderId = '00000000-0000-4000-8000-000000000002'
    const accountAddress = '0x0000000000000000000000000000000000000002'
    const responses = [
      {
        order: officialOrder({
          orderId,
          funderAddress: accountAddress,
          side: 'buy',
          qty: '100',
          filled: officialFill('0.041', '100', '2439.02439', '2439.02')
        }),
        fills: []
      },
      { ok: true }
    ]
    const { flash, fetchMock } = flashWithFetch(queuedJsonResponses(responses))
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
    const orderQuote = { ...quote, quoteId: quote.id }
    const orderResponse = (status: string, filledOutputAmount?: string) => ({
      orderId,
      status,
      filledOutputAmount,
      quote: orderQuote
    })
    const responses = [
      { orderId, status: 'accepted' },
      orderResponse('partially_filled', '1000'),
      orderResponse('partially_filled', '1000'),
      orderResponse('partially_filled', '1500'),
      orderResponse('cancelled', '1500')
    ]
    const track = mock()
    const refresh = mock()
    const { flash, fetchMock } = flashWithFetch(queuedJsonResponses(responses), {
      positionSync: { track, refresh }
    })
    await flash.submitOrder({
      ...request,
      quote,
      quoteId: quote.id,
      idempotencyKey: quote.id,
      signature: '0xsignature'
    })
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.any(URL),
      expect.objectContaining({ headers: expect.objectContaining({ 'Idempotency-Key': quote.id }) })
    )
    expect(track).toHaveBeenCalledTimes(1)
    expect(track).toHaveBeenCalledWith({
      address: request.accountAddress,
      chainId: 31337,
      tokens: [canonicalToken(FLASH_WETH_ASSET, 31337), canonicalToken(FLASH_USDC_ASSET, 31337)]
    })
    expect(refresh).not.toHaveBeenCalled()
    for (const expectedRefreshes of [1, 1, 2, 3]) {
      await flash.getOrder({ orderId })
      expect(refresh).toHaveBeenCalledTimes(expectedRefreshes)
    }
    expect(refresh).toHaveBeenLastCalledWith(
      expect.objectContaining({ address: request.accountAddress, chainId: 31337 })
    )
  })
  it('hydrates external WebSocket orders through the canonical order, notification, and position path', async () => {
    const sockets: FakeFlashWebSocket[] = []
    const track = mock()
    const refresh = mock()
    const accountAddress = '0x00000000000000000000000000000000000000a1'
    const orderId = 'websocket-agent-order'
    const flash = createFlashService({
      assetRateService,
      store,
      createWebSocket: () => {
        const socket = new FakeFlashWebSocket()
        sockets.push(socket)
        return socket as unknown as WebSocket
      },
      positionSync: { track, refresh }
    })
    services.push(flash)
    for (const sessionId of ['agent-session-one', 'agent-session-two']) {
      expect(startAgentSession(flash, accountAddress, sessionId)).toBe(true)
    }
    expect(sockets).toHaveLength(2)
    const socket = sockets[0]
    const persistedOrder = () => store.getState().main.orders[orderId]
    const notification = () => store.getState().view.notifications[`flash-order:${orderId}`]
    socket.open()
    socket.receive({
      channel: 'subscriptions',
      type: 'ack',
      subscriptions: ['orders', 'heartbeats']
    })
    sendOfficialOrder(socket, 'snapshot', {
      orderId,
      funderAddress: accountAddress,
      status: 'ORDER_STATUS_ACCEPTED',
      filled: null
    })
    await Bun.sleep(0)
    expect(persistedOrder()).toMatchObject({ accountAddress, status: 'accepted', open: true })
    expect(notification()).toMatchObject({ state: 'pending', metadata: { orderId, status: 'accepted' } })
    expect(track).toHaveBeenCalledTimes(1)
    const partial = officialOrder({
      orderId,
      funderAddress: accountAddress,
      status: 'ORDER_STATUS_PARTIALLY_FILLED',
      filled: officialFill('0.5', '1200', '2400')
    })
    sendOrders(socket, 'update', partial)
    sendOrders(socket, 'update', partial)
    await Bun.sleep(0)
    expect(persistedOrder()).toMatchObject({ status: 'partially-filled', filledOutputAmount: '1200' })
    expect(refresh).toHaveBeenCalledTimes(1)
    sendOfficialOrder(socket, 'update', {
      orderId,
      funderAddress: accountAddress,
      status: 'ORDER_STATUS_FILLED',
      closedAt: '2026-07-14T08:02:00.000Z'
    })
    await Bun.sleep(0)
    expect(persistedOrder()).toMatchObject({ status: 'filled', open: false })
    expect(notification()).toMatchObject({ state: 'completed', metadata: { orderId, status: 'filled' } })
    expect(refresh).toHaveBeenCalledTimes(2)
    expect(flash.stopAgentSession('agent-session-one')).toBe(true)
    expect(sockets[0].readyState).toBe(WebSocket.CLOSED)
    expect(sockets[1].readyState).toBe(WebSocket.CONNECTING)
    expect(flash.stopAgentSession('agent-session-two')).toBe(true)
    expect(sockets[1].readyState).toBe(WebSocket.CLOSED)
  })
  it('closes an agent order stream when its session expires', async () => {
    const socket = new FakeFlashWebSocket()
    const flash = createFlashService({
      assetRateService,
      store,
      createWebSocket: () => socket as unknown as WebSocket
    })
    services.push(flash)
    expect(
      startAgentSession(flash, '0x00000000000000000000000000000000000000a2', 'expiring-agent-session', 25)
    ).toBe(true)
    await Bun.sleep(50)
    expect(socket.readyState).toBe(WebSocket.CLOSED)
    expect(flash.stopAgentSession('expiring-agent-session')).toBe(false)
  })
})
