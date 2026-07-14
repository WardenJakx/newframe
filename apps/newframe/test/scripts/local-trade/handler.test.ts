import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test'
import { JsonRpcProvider } from 'ethers'

import { handleLocalTradeRequest, resetLocalTradeState } from '../../../scripts/local-trade/handler'
import { FLASH_USDC_ADDRESS, FLASH_WETH_ADDRESS } from '../../../resources/domain/flash'

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
  const response = await handleLocalTradeRequest(
    new Request('http://127.0.0.1:8422/v1/quote', {
      method: 'POST',
      body: JSON.stringify(quoteRequest(overrides))
    })
  )

  return { response, body: await json(response) }
}

async function json(response: Response) {
  return response.json() as Promise<Record<string, any>>
}

describe('local trade service handler', () => {
  let allowanceCall: ReturnType<typeof spyOn>

  beforeEach(() => {
    resetLocalTradeState()
    allowanceCall = spyOn(JsonRpcProvider.prototype, 'call').mockResolvedValue(ZERO_ALLOWANCE)
  })

  afterEach(() => allowanceCall.mockRestore())

  it('responds to health checks', async () => {
    const response = await handleLocalTradeRequest(new Request('http://127.0.0.1:8422/health'))
    const body = await json(response)

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.chainId).toBe(31337)
  })

  it('lists service-instance orders only', async () => {
    const missingFunder = await handleLocalTradeRequest(new Request('http://127.0.0.1:8422/v1/orders'))
    const response = await handleLocalTradeRequest(
      new Request(`http://127.0.0.1:8422/v1/orders?funderAddress=${FUNDER_ADDRESS}`)
    )
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

  it('accepts integer TWAP schedules from 300 seconds and rejects unsupported TWAP fields', async () => {
    const valid = await requestQuote({
      durationSeconds: 300,
      orderType: 'twap',
      twapBucketCount: 2
    })

    expect(valid.response.status).toBe(200)

    for (const overrides of [
      { durationSeconds: 299, orderType: 'twap' },
      { durationSeconds: '300', orderType: 'twap' },
      { durationSeconds: 300, orderType: 'twap', twapBucketCount: 1 },
      { durationSeconds: 300, orderType: 'twap', twapBucketCount: 2.5 },
      { durationSeconds: 300, limitNotionalPrice: '2200', orderType: 'twap' },
      { durationSeconds: 300, expireTime: '2030-01-02T03:04:05.000Z', orderType: 'twap' }
    ]) {
      const result = await requestQuote(overrides)
      expect(result.response.status).toBe(400)
    }
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
    const accepted = await handleLocalTradeRequest(
      new Request('http://127.0.0.1:8422/v1/order', {
        method: 'POST',
        body: JSON.stringify(submitBody)
      })
    )

    expect(accepted.status).toBe(200)

    const mismatchedQuote = await requestQuote()
    const mismatched = await handleLocalTradeRequest(
      new Request('http://127.0.0.1:8422/v1/order', {
        method: 'POST',
        body: JSON.stringify({
          ...submitBody,
          quoteId: mismatchedQuote.body.quoteId,
          evmOrderTypedData: '{}'
        })
      })
    )
    const quoteOnlyField = await handleLocalTradeRequest(
      new Request('http://127.0.0.1:8422/v1/order', {
        method: 'POST',
        body: JSON.stringify({
          ...submitBody,
          durationSeconds: 300,
          quoteId: mismatchedQuote.body.quoteId,
          evmOrderTypedData: mismatchedQuote.body.evm.orderTypedData
        })
      })
    )

    expect(mismatched.status).toBe(400)
    expect(quoteOnlyField.status).toBe(400)
  })

  it('mirrors official funder lookup and canonical cancellation requirements', async () => {
    const quoted = await requestQuote({ limitNotionalPrice: '2500', orderType: 'limit' })
    const submit = await handleLocalTradeRequest(
      new Request('http://127.0.0.1:8422/v1/order', {
        method: 'POST',
        body: JSON.stringify({
          ...quoteRequest({ limitNotionalPrice: '2500', orderType: 'limit' }),
          targetAsset: quoted.body.targetAsset,
          contraAsset: quoted.body.contraAsset,
          quoteId: quoted.body.quoteId,
          userSignature: '0xorder-signature',
          evmOrderTypedData: quoted.body.evm.orderTypedData
        })
      })
    )
    const submitted = await json(submit)
    const orderId = String(submitted.orderId)
    const missingFunder = await handleLocalTradeRequest(
      new Request(`http://127.0.0.1:8422/v1/orders/${orderId}`)
    )
    const lookup = await handleLocalTradeRequest(
      new Request(`http://127.0.0.1:8422/v1/orders/${orderId}?funderAddress=${FUNDER_ADDRESS}`)
    )
    const wrongCancel = await handleLocalTradeRequest(
      new Request(`http://127.0.0.1:8422/v1/orders/${orderId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ cancelMessage: orderId, userSignature: '0xcancel' })
      })
    )
    const cancelMessage = `Definitive Flash v1 — Cancel Order\nOrder: ${orderId}`
    const cancel = await handleLocalTradeRequest(
      new Request(`http://127.0.0.1:8422/v1/orders/${orderId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ cancelMessage, userSignature: '0xcancel' })
      })
    )

    expect(submit.status).toBe(200)
    expect(missingFunder.status).toBe(400)
    expect(lookup.status).toBe(200)
    expect(wrongCancel.status).toBe(400)
    expect(cancel.status).toBe(200)
  })

  it('returns clear errors for unknown quote submits and unsupported quote assets', async () => {
    const submit = await handleLocalTradeRequest(
      new Request('http://127.0.0.1:8422/v1/order', {
        method: 'POST',
        body: JSON.stringify({ quoteId: 'missing', userSignature: '0xsig' })
      })
    )
    const submitBody = await json(submit)

    expect(submit.status).toBe(404)
    expect(submitBody.message).toContain('Unknown local Flash quote')

    const quote = await handleLocalTradeRequest(
      new Request('http://127.0.0.1:8422/v1/quote', {
        method: 'POST',
        body: JSON.stringify({
          contraAsset: '0x0000000000000000000000000000000000000000',
          funderAddress: FUNDER_ADDRESS,
          qty: '1',
          side: 'sell',
          targetAsset: '0x0000000000000000000000000000000000000001'
        })
      })
    )
    const quoteBody = await json(quote)

    expect(quote.status).toBe(500)
    expect(quoteBody.message).toContain('Unsupported local Flash target asset')
  })
})
