import { beforeEach, describe, expect, it } from 'bun:test'

import { handleLocalTradeRequest, resetLocalTradeState } from '../../../scripts/local-trade/handler'

async function json(response: Response) {
  return response.json() as Promise<Record<string, any>>
}

describe('local trade service handler', () => {
  beforeEach(() => {
    resetLocalTradeState()
  })

  it('responds to health checks', async () => {
    const response = await handleLocalTradeRequest(new Request('http://127.0.0.1:8422/health'))
    const body = await json(response)

    expect(response.status).toBe(200)
    expect(body.ok).toBe(true)
    expect(body.chainId).toBe(31337)
  })

  it('lists service-instance orders only', async () => {
    const response = await handleLocalTradeRequest(new Request('http://127.0.0.1:8422/v1/orders'))
    const body = await json(response)

    expect(response.status).toBe(200)
    expect(body.orders).toEqual([])
    expect(body.count).toBe(0)
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
          funderAddress: '0x0000000000000000000000000000000000000001',
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
