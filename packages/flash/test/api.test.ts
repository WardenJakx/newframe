import { describe, expect, it, mock } from 'bun:test'

import { createFlashApi, flashCancelMessage } from '../src/api.ts'

const account = '0x0000000000000000000000000000000000000001'

describe('Flash API client', () => {
  it('builds order routes, statuses, and cancellation bodies once for both callers', async () => {
    const fetcher = mock(async (url: string | URL | Request, _init?: RequestInit) => {
      const path = new URL(url instanceof Request ? url.url : url).pathname
      let body: object = { orderId: 'order/1' }
      if (path.endsWith('/cancel')) {
        body = {}
      } else if (path.endsWith('/orders')) {
        body = { orders: [] }
      }
      return Response.json(body)
    })
    const api = createFlashApi({ baseUrl: 'http://127.0.0.1:8422/v1', fetch: fetcher })

    await api.listOrders(account, { status: ['partially-filled', 'ORDER_STATUS_CANCELLED'], pageSize: 250 })
    await api.getOrder(account, 'order/1')
    await api.cancelOrder('order/1', '0xsigned')

    const listRequestUrl = fetcher.mock.calls[0]?.[0]
    const orderRequestUrl = fetcher.mock.calls[1]?.[0]
    const cancelRequestUrl = fetcher.mock.calls[2]?.[0]
    if (
      typeof listRequestUrl !== 'string' ||
      typeof orderRequestUrl !== 'string' ||
      typeof cancelRequestUrl !== 'string'
    ) {
      throw new Error('Expected Flash URLs')
    }
    const listUrl = new URL(listRequestUrl)
    expect(listUrl.pathname).toBe('/v1/orders')
    expect(listUrl.searchParams.get('funderAddress')).toBe(account)
    expect(listUrl.searchParams.get('statuses')).toBe('ORDER_STATUS_PARTIALLY_FILLED,ORDER_STATUS_CANCELLED')
    expect(listUrl.searchParams.get('pageSize')).toBe('200')
    expect(orderRequestUrl).toContain('/orders/order%2F1?')
    expect(cancelRequestUrl).toContain('/orders/order%2F1/cancel')
    const cancelInit = fetcher.mock.calls[2]?.[1]
    if (typeof cancelInit?.body !== 'string') {
      throw new Error('Expected Flash cancellation body')
    }
    expect(JSON.parse(cancelInit.body)).toEqual({
      cancelMessage: flashCancelMessage('order/1'),
      userSignature: '0xsigned'
    })
  })

  it('keeps the packaged key on the production Flash origin only', async () => {
    const fetcher = mock(async (_url: string | URL | Request, _init?: RequestInit) =>
      Response.json({ orderId: '1' })
    )
    await createFlashApi({
      baseUrl: 'https://example.com/v1',
      runtime: { isDev: false },
      fetch: fetcher
    }).getOrder(account, '1')
    expect(new Headers(fetcher.mock.calls[0]?.[1]?.headers).has('x-definitive-api-key')).toBe(false)
    await createFlashApi({
      baseUrl: 'https://flash.definitive.fi/v1',
      runtime: { isDev: false },
      fetch: fetcher
    }).getOrder(account, '1')
    expect(new Headers(fetcher.mock.calls[1]?.[1]?.headers).has('x-definitive-api-key')).toBe(true)
  })

  it('rejects malformed successful responses and inputs at the client boundary', async () => {
    const fetcher = mock(async () => Response.json({ orders: {} }))
    const api = createFlashApi({ baseUrl: 'http://127.0.0.1:8422/v1', fetch: fetcher })

    expect(api.listOrders(account)).rejects.toThrow()
    expect(api.getOrder(account, '')).rejects.toThrow()
    expect(api.quote({} as never)).rejects.toThrow()
    expect(api.submitOrder({} as never)).rejects.toThrow()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
