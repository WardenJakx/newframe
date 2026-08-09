import { expect, it } from 'bun:test'

import { createProviderProxyConnection } from './proxy'

it('owns connection and request events through an explicit lifecycle', async () => {
  const proxy = createProviderProxyConnection()
  const events: Array<{ type: string; payload?: RPCRequestPayload }> = []
  proxy.on('connect', () => events.push({ type: 'connect' }))
  proxy.on('provider:send', (payload) => events.push({ type: 'send', payload }))
  proxy.on('provider:subscribe', (payload) => events.push({ type: 'subscribe', payload }))
  proxy.on('close', () => events.push({ type: 'close' }))

  await expect(proxy.send({ id: 0, jsonrpc: '2.0', method: 'eth_chainId', params: [] })).rejects.toThrow(
    'not started'
  )

  proxy.start()
  proxy.start()
  await new Promise<void>((resolve) => process.nextTick(resolve))
  await proxy.send({ id: 1, jsonrpc: '2.0', method: 'eth_chainId', params: [] })
  await proxy.send({ id: 2, jsonrpc: '2.0', method: 'eth_subscribe', params: ['newHeads'] })
  proxy.dispose()
  proxy.dispose()

  expect(events).toEqual([
    { type: 'connect' },
    {
      type: 'send',
      payload: expect.objectContaining({
        id: 1,
        method: 'eth_chainId',
        _origin: expect.any(String)
      })
    },
    {
      type: 'subscribe',
      payload: expect.objectContaining({
        id: 2,
        method: 'eth_subscribe',
        _origin: expect.any(String)
      })
    },
    { type: 'close' }
  ])
  expect({
    listeners: proxy.eventNames(),
    started: proxy.started
  }).toEqual({
    listeners: [],
    started: false
  })
})
