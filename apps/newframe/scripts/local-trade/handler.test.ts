import { afterEach, beforeEach, describe, expect, it, jest as timers, spyOn } from 'bun:test'
import { JsonRpcProvider, Wallet } from 'ethers'

import { handleLocalTradeRequest, resetLocalTradeState, subscribeLocalTradeOrders } from './handler'
import {
  FLASH_ANVIL_CHAIN_ID,
  FLASH_BASE_CHAIN_ID,
  FLASH_BASE_USDC_ADDRESS,
  FLASH_BASE_WETH_ADDRESS,
  FLASH_USDC_ADDRESS,
  FLASH_WETH_ADDRESS
} from '../../src/features/transactions/trade/domain/constants'

const FUNDER_ADDRESS = '0x0000000000000000000000000000000000000001'
const ZERO_ALLOWANCE = `0x${'0'.repeat(64)}`

function quoteRequest(overrides: Record<string, unknown> = {}) {
  return {
    contraAsset: FLASH_USDC_ADDRESS,
    contraChain: 'anvil',
    funderAddress: FUNDER_ADDRESS,
    maxPriceImpact: '0.05',
    maxSlippage: '0.05',
    orderType: 'market',
    qty: '1',
    side: 'sell',
    targetAsset: FLASH_WETH_ADDRESS,
    targetChain: 'anvil',
    ...overrides
  }
}

async function requestQuote(overrides: Record<string, unknown> = {}) {
  const response = await post('/v1/quote', quoteRequest(overrides))

  return { response, body: await json(response) }
}

const get = (path: string) => handleLocalTradeRequest(new Request(`http://127.0.0.1:8422${path}`))
const post = (path: string, body: unknown) =>
  handleLocalTradeRequest(
    new Request(`http://127.0.0.1:8422${path}`, { method: 'POST', body: JSON.stringify(body) })
  )

async function json(response: Response) {
  return response.json() as Promise<Record<string, any>>
}

describe('local trade service handler', () => {
  let allowanceCall: ReturnType<typeof spyOn>
  let sendTransaction: ReturnType<typeof spyOn>

  beforeEach(() => {
    timers.useFakeTimers()
    resetLocalTradeState()
    allowanceCall = spyOn(JsonRpcProvider.prototype, 'call').mockResolvedValue(ZERO_ALLOWANCE)
    sendTransaction = spyOn(Wallet.prototype, 'sendTransaction').mockResolvedValue({
      hash: `0x${'1'.repeat(64)}`,
      wait: async () => ({ status: 1 })
    } as any)
  })

  afterEach(() => {
    allowanceCall.mockRestore()
    sendTransaction.mockRestore()
    timers.useRealTimers()
  })

  it('responds to health checks', async () => {
    const response = await get('/health')
    const body = await json(response)

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.chainId).toBe(31337)
  })

  it('lists service-instance orders only', async () => {
    const missingFunder = await get('/v1/orders')
    const response = await get(`/v1/orders?funderAddress=${FUNDER_ADDRESS}`)
    const body = await json(response)

    expect(missingFunder.status).toBe(400)
    expect(response.status).toBe(200)
    expect(body.orders).toEqual([])
    expect(body.count).toBe(0)
  })

  it('returns the current Flash quote shape with notionals, fees, and local actions', async () => {
    const { response, body } = await requestQuote()

    expect(response.status).toBe(200)
    expect(body).toMatchObject({
      orderType: 'market',
      side: 'sell',
      targetAsset: FLASH_WETH_ADDRESS.toLowerCase(),
      contraAsset: FLASH_USDC_ADDRESS.toLowerCase(),
      from: { asset: 'target', amount: '1', notional: '2400' },
      to: { asset: 'contra', amount: '2398.08', notional: '2398.08' },
      fees: { estimatedFeeNotional: '1.92' },
      evm: { permitTypedData: null },
      svm: null,
      local: {
        chain: 'anvil',
        maxPriceImpact: '0.05',
        maxSlippage: '0.05'
      }
    })
    expect(String(body.quoteId).startsWith('local-quote-')).toBe(true)
    expect(typeof body.evm.orderTypedData).toBe('string')
    expect(JSON.parse(body.evm.orderTypedData).message.quoteId).toBe(body.quoteId)
    expect(body.evm.approveTx).toBeTruthy()
    expect(body.actions.approval.kind).toBe('approve')
    expect(body.steps.find((step: Record<string, unknown>) => step.kind === 'sign')?.label).toBe('Sign order')
  })

  it('accepts limit expiry and optional trigger-limit prices', async () => {
    const expireTime = '2030-01-02T03:04:05.000Z'
    const limit = await requestQuote({
      expireTime,
      limitNotionalPrice: '2500',
      orderType: 'limit'
    })
    const triggerLimit = await requestQuote({
      expireTime,
      limitNotionalPrice: '2450',
      orderType: 'take-profit',
      triggers: [{ notionalPrice: '2600', triggerType: 'upper' }]
    })

    expect(limit.response.status).toBe(200)
    expect(limit.body.local).toMatchObject({ expireTime, limitNotionalPrice: '2500', triggers: [] })
    expect(triggerLimit.response.status).toBe(200)
    expect(triggerLimit.body.local).toMatchObject({
      expireTime,
      limitNotionalPrice: '2450',
      triggers: [{ notionalPrice: '2600', triggerType: 'upper' }]
    })
  })

  it('accepts scheduled and price-bounded TWAPs from 300 seconds', async () => {
    const startTime = '2099-01-02T03:04:05.000Z'
    const valid = await requestQuote({
      durationSeconds: 300,
      limitNotionalPrice: '2200',
      orderType: 'twap',
      startTime,
      twapBucketCount: 2
    })

    expect(valid.response.status).toBe(200)
    expect(valid.body.local).toMatchObject({
      limitNotionalPrice: '2200',
      startTime,
      twapBucketCount: 2
    })
    expect(valid.body.expiresAt).toBe('2099-01-02T03:09:05.000Z')

    for (const overrides of [
      { durationSeconds: 299, orderType: 'twap' },
      { durationSeconds: '300', orderType: 'twap' },
      { durationSeconds: 300, orderType: 'twap', twapBucketCount: 1 },
      { durationSeconds: 300, orderType: 'twap', twapBucketCount: 2.5 },
      { durationSeconds: 300, orderType: 'twap', startTime: 'not-a-date' },
      { durationSeconds: 300, orderType: 'twap', startTime: '2000-01-01T00:00:00.000Z' },
      { durationSeconds: 300, expireTime: '2030-01-02T03:04:05.000Z', orderType: 'twap' }
    ]) {
      const result = await requestQuote(overrides)
      expect(result.response.status).toBe(400)
    }
  })

  it('requires TWAP schedule and limit fields to echo on submit while omitting duration', async () => {
    const fields = {
      durationSeconds: 300,
      limitNotionalPrice: '2200',
      orderType: 'twap',
      startTime: '2099-01-02T03:04:05.000Z',
      twapBucketCount: 2
    }
    const quoted = await requestQuote(fields)
    const { durationSeconds: _durationSeconds, ...submitFields } = fields
    const submitBody = {
      ...quoteRequest(submitFields),
      targetAsset: quoted.body.targetAsset,
      contraAsset: quoted.body.contraAsset,
      quoteId: quoted.body.quoteId,
      userSignature: '0xorder-signature',
      evmOrderTypedData: quoted.body.evm.orderTypedData
    }
    const accepted = await post('/v1/order', submitBody)
    const mismatched = await post('/v1/order', {
      ...submitBody,
      startTime: '2099-01-02T04:04:05.000Z'
    })

    expect(accepted.status).toBe(200)
    expect(mismatched.status).toBe(400)
  })

  it('enforces supported stop, stop-loss, and take-profit side and trigger combinations', async () => {
    for (const overrides of [
      {
        orderType: 'stop',
        qty: '100',
        side: 'buy',
        triggers: [{ notionalPrice: '2500', triggerType: 'upper' }]
      },
      {
        orderType: 'stop-loss',
        triggers: [{ notionalPrice: '2200', triggerType: 'lower' }]
      },
      {
        orderType: 'take-profit',
        triggers: [{ notionalPrice: '2600', triggerType: 'upper' }]
      }
    ]) {
      const result = await requestQuote(overrides)
      expect(result.response.status).toBe(200)
    }

    const stopBuy = await requestQuote({
      orderType: 'stop',
      qty: '100',
      side: 'buy',
      triggers: [{ notionalPrice: '2500', triggerType: 'upper' }]
    })
    expect(stopBuy.body.from.asset).toBe('contra')
    expect(stopBuy.body.to.asset).toBe('target')

    for (const overrides of [
      { orderType: 'stop', triggers: [{ notionalPrice: '2500', triggerType: 'upper' }] },
      {
        orderType: 'stop',
        side: 'buy',
        triggers: [{ notionalPrice: '2200', triggerType: 'lower' }]
      },
      {
        orderType: 'stop-loss',
        side: 'buy',
        triggers: [{ notionalPrice: '2200', triggerType: 'lower' }]
      },
      {
        orderType: 'take-profit',
        triggers: [{ notionalPrice: '2600', triggerType: 'lower' }]
      },
      { orderType: 'take-profit', triggers: [] },
      {
        orderType: 'limit',
        limitNotionalPrice: '2500',
        triggers: [{ notionalPrice: '2600', triggerType: 'upper' }]
      }
    ]) {
      const result = await requestQuote(overrides)
      expect(result.response.status).toBe(400)
    }
  })

  it('rejects bracket orders and malformed protection or expiry fields', async () => {
    for (const overrides of [
      {
        orderType: 'bracket',
        triggers: [
          { notionalPrice: '2200', triggerType: 'lower' },
          { notionalPrice: '2600', triggerType: 'upper' }
        ]
      },
      { maxSlippage: '1.01' },
      { maxPriceImpact: '-0.01' },
      { expireTime: 'not-a-date', limitNotionalPrice: '2500', orderType: 'limit' }
    ]) {
      const result = await requestQuote(overrides)
      expect(result.response.status).toBe(400)
    }
  })

  it('requires submit fields and typed data to exactly echo the quote', async () => {
    const quoted = await requestQuote()
    const submitBody = {
      ...quoteRequest(),
      targetAsset: quoted.body.targetAsset,
      contraAsset: quoted.body.contraAsset,
      quoteId: quoted.body.quoteId,
      userSignature: '0xorder-signature',
      evmOrderTypedData: quoted.body.evm.orderTypedData
    }
    const accepted = await post('/v1/order', submitBody)

    expect(accepted.status).toBe(200)

    const mismatchedQuote = await requestQuote()
    const mismatched = await post('/v1/order', {
      ...submitBody,
      quoteId: mismatchedQuote.body.quoteId,
      evmOrderTypedData: '{}'
    })
    const quoteOnlyField = await post('/v1/order', {
      ...submitBody,
      durationSeconds: 300,
      quoteId: mismatchedQuote.body.quoteId,
      evmOrderTypedData: mismatchedQuote.body.evm.orderTypedData
    })

    expect(mismatched.status).toBe(400)
    expect(quoteOnlyField.status).toBe(400)
  })

  it('mirrors official funder lookup and canonical cancellation requirements', async () => {
    const quoted = await requestQuote({ limitNotionalPrice: '2500', orderType: 'limit' })
    const submit = await post('/v1/order', {
      ...quoteRequest({ limitNotionalPrice: '2500', orderType: 'limit' }),
      targetAsset: quoted.body.targetAsset,
      contraAsset: quoted.body.contraAsset,
      quoteId: quoted.body.quoteId,
      userSignature: '0xorder-signature',
      evmOrderTypedData: quoted.body.evm.orderTypedData
    })
    const submitted = await json(submit)
    const orderId = String(submitted.orderId)
    const missingFunder = await get(`/v1/orders/${orderId}`)
    const lookup = await get(`/v1/orders/${orderId}?funderAddress=${FUNDER_ADDRESS}`)
    const wrongCancel = await post(`/v1/orders/${orderId}/cancel`, {
      cancelMessage: orderId,
      userSignature: '0xcancel'
    })
    const cancelMessage = `Definitive Flash v1 — Cancel Order\nOrder: ${orderId}`
    const cancel = await post(`/v1/orders/${orderId}/cancel`, { cancelMessage, userSignature: '0xcancel' })

    expect(submit.status).toBe(200)
    expect(missingFunder.status).toBe(400)
    expect(lookup.status).toBe(200)
    expect(wrongCancel.status).toBe(400)
    expect(cancel.status).toBe(200)
  })

  for (const direction of [
    {
      name: 'Anvil to Base',
      targetAsset: FLASH_WETH_ADDRESS,
      targetChain: 'anvil',
      contraAsset: FLASH_BASE_USDC_ADDRESS,
      contraChain: 'base',
      side: 'sell',
      spentChainId: FLASH_ANVIL_CHAIN_ID,
      receiveChainId: FLASH_BASE_CHAIN_ID
    },
    {
      name: 'Base to Anvil',
      targetAsset: FLASH_BASE_WETH_ADDRESS,
      targetChain: 'base',
      contraAsset: FLASH_USDC_ADDRESS,
      contraChain: 'anvil',
      side: 'sell',
      spentChainId: FLASH_BASE_CHAIN_ID,
      receiveChainId: FLASH_ANVIL_CHAIN_ID
    }
  ]) {
    it(`keeps a ${direction.name} market order accepted until signed cancellation`, async () => {
      const published: Record<string, any>[] = []
      const unsubscribe = subscribeLocalTradeOrders((order) => published.push(order))
      const request = quoteRequest({
        contraAsset: direction.contraAsset,
        contraChain: direction.contraChain,
        recipientAddress: FUNDER_ADDRESS,
        side: direction.side,
        targetAsset: direction.targetAsset,
        targetChain: direction.targetChain
      })
      const quoteResponse = await post('/v1/quote', request)
      const quote = await json(quoteResponse)
      const typedData = JSON.parse(quote.evm.orderTypedData)

      expect(quoteResponse.status).toBe(200)
      expect(quote.quoteId).toBe('')
      expect(String(quote.bridgeQuoteId).startsWith('local-bridge-')).toBe(true)
      expect(quote.actions).toEqual({ approval: null, wrap: null })
      expect(quote.wrap).toBeNull()
      expect(quote.evm.approveTx).toBeNull()
      expect(quote.steps.map((step: Record<string, unknown>) => step.kind)).toEqual(['sign', 'submit'])
      expect(typedData.domain.chainId).toBe(direction.spentChainId)
      expect(typedData.message.settlementAsset).toBe('0x0000000000000000000000000000000000005e77')
      expect(quote.spentAsset.chainId).toBe(direction.spentChainId)
      expect(quote.receiveAsset.chainId).toBe(direction.receiveChainId)

      const submittedResponse = await post('/v1/order', {
        ...request,
        targetAsset: quote.targetAsset,
        contraAsset: quote.contraAsset,
        bridgeQuoteId: quote.bridgeQuoteId,
        userSignature: '0xorder-signature',
        evmOrderTypedData: quote.evm.orderTypedData
      })
      const submitted = await json(submittedResponse)
      const orderId = String(submitted.orderId)

      expect(submittedResponse.status).toBe(200)
      expect(submitted.order).toMatchObject({
        normalizedStatus: 'accepted',
        open: true,
        cancellable: true,
        quoteId: ''
      })
      expect(submitted.order).not.toHaveProperty('chainId')
      expect(submitted.order.targetAsset.chain.id).toBe(direction.targetChain)
      expect(submitted.order.contraAsset.chain.id).toBe(direction.contraChain)

      timers.advanceTimersByTime(3_001)
      await Promise.resolve()
      expect(sendTransaction.mock.calls).toEqual([])

      const lookupResponse = await get(`/v1/orders/${orderId}?funderAddress=${FUNDER_ADDRESS}`)
      const lookup = await json(lookupResponse)
      const listResponse = await get(`/v1/orders?funderAddress=${FUNDER_ADDRESS}`)
      const list = await json(listResponse)
      expect(lookup).toMatchObject({ normalizedStatus: 'accepted', open: true, cancellable: true })
      expect(lookup).not.toHaveProperty('chainId')
      expect(list.orders).toHaveLength(1)
      expect(list.orders[0]).toMatchObject({ orderId, normalizedStatus: 'accepted', open: true })

      const cancelMessage = `Definitive Flash v1 — Cancel Order\nOrder: ${orderId}`
      const cancelResponse = await post(`/v1/orders/${orderId}/cancel`, {
        cancelMessage,
        userSignature: '0xcancel'
      })
      const cancelled = await json(cancelResponse)
      expect(cancelResponse.status).toBe(200)
      expect(cancelled.order).toMatchObject({
        normalizedStatus: 'cancelled',
        open: false,
        cancellable: false
      })
      expect(cancelled.order).not.toHaveProperty('chainId')
      expect(published.map((order) => order.normalizedStatus)).toEqual(['accepted', 'cancelled'])
      expect(published.every((order) => !('chainId' in order))).toBe(true)
      unsubscribe()
    })
  }

  it('keeps distinct cross-chain market quotes addressable across protection changes', async () => {
    const crossChainRequest = quoteRequest({
      contraAsset: FLASH_BASE_USDC_ADDRESS,
      contraChain: 'base',
      recipientAddress: FUNDER_ADDRESS,
      targetChain: 'anvil'
    })
    const first = await requestQuote({
      ...crossChainRequest,
      maxSlippage: '0.01'
    })
    const second = await requestQuote({
      ...crossChainRequest,
      maxSlippage: '0.02'
    })

    expect(first.response.status).toBe(200)
    expect(second.response.status).toBe(200)
    expect(first.body.bridgeQuoteId).not.toBe(second.body.bridgeQuoteId)

    const submitted = await post('/v1/order', {
      ...crossChainRequest,
      maxSlippage: '0.01',
      targetAsset: first.body.targetAsset,
      contraAsset: first.body.contraAsset,
      bridgeQuoteId: first.body.bridgeQuoteId,
      userSignature: '0xorder-signature',
      evmOrderTypedData: first.body.evm.orderTypedData
    })

    expect(submitted.status).toBe(200)
  })

  it('continues to fill same-chain Anvil market orders after the local delay', async () => {
    const quoted = await requestQuote()
    const submittedResponse = await post('/v1/order', {
      ...quoteRequest(),
      targetAsset: quoted.body.targetAsset,
      contraAsset: quoted.body.contraAsset,
      quoteId: quoted.body.quoteId,
      userSignature: '0xorder-signature',
      evmOrderTypedData: quoted.body.evm.orderTypedData
    })
    const submitted = await json(submittedResponse)
    const orderId = String(submitted.orderId)

    expect(submitted.order).toMatchObject({ normalizedStatus: 'accepted', open: true, cancellable: false })
    timers.advanceTimersByTime(3_000)
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    const lookup = await json(await get(`/v1/orders/${orderId}?funderAddress=${FUNDER_ADDRESS}`))
    expect(sendTransaction.mock.calls).toHaveLength(1)
    expect(lookup).toMatchObject({ normalizedStatus: 'filled', open: false, cancellable: false })
    expect(lookup.fillTransactionHash).toBe(`0x${'1'.repeat(64)}`)
  })

  it('returns clear errors for unknown quote submits and unsupported quote assets', async () => {
    const submit = await post('/v1/order', { quoteId: 'missing', userSignature: '0xsig' })
    const submitBody = await json(submit)

    expect(submit.status).toBe(404)
    expect(submitBody.message).toContain('Unknown local Flash quote')

    const quote = await post('/v1/quote', {
      contraAsset: '0x0000000000000000000000000000000000000000',
      funderAddress: FUNDER_ADDRESS,
      qty: '1',
      side: 'sell',
      targetAsset: '0x0000000000000000000000000000000000000001'
    })
    const quoteBody = await json(quote)

    expect(quote.status).toBe(500)
    expect(quoteBody.message).toContain('Unsupported local Flash target asset')
  })
})
