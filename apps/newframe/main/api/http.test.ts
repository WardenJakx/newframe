import { expect, it } from 'bun:test'
import { EventEmitter } from 'events'

import { createHttpRpcTransport } from './http'

class FakeProvider extends EventEmitter {
  readonly requests: RPCRequestPayload[] = []
  callback?: (response: RPCResponsePayload) => void
  principal?: unknown

  send(payload: RPCRequestPayload, callback?: (response: RPCResponsePayload) => void, principal?: unknown) {
    this.requests.push(payload)
    this.callback = callback
    this.principal = principal
  }
}

it('owns its provider subscription and rejects unsupported HTTP methods observably', () => {
  const provider = new FakeProvider()
  const transport = createHttpRpcTransport({
    provider,
    accounts: { getSelectedAddresses: () => [] },
    store: { endOriginSession: () => undefined },
    origins: {
      updateOrigin: (payload: RPCRequestPayload) => ({ payload, chainId: 1 }),
      isTrusted: async () => true
    } as never,
    handleAgentRequest: async () => undefined,
    createConnectionId: () => 'http-connection'
  })
  const request = Object.assign(new EventEmitter(), {
    headers: {},
    method: 'GET'
  })
  const response = Object.assign(new EventEmitter(), {
    body: '',
    headers: {} as Record<string, string>,
    status: 0,
    setHeader(name: string, value: string) {
      this.headers[name] = value
    },
    writeHead(status: number) {
      this.status = status
      return this
    },
    end(body = '') {
      this.body = body
      return this
    }
  })

  expect(provider.listenerCount('data:subscription')).toBe(0)
  transport.start()
  transport.start()
  transport.handler(request as never, response as never)

  expect({
    body: JSON.parse(response.body),
    providerRequests: provider.requests,
    status: response.status,
    subscriptionListeners: provider.listenerCount('data:subscription')
  }).toEqual({
    body: { error: 'Permission Denied' },
    providerRequests: [],
    status: 401,
    subscriptionListeners: 1
  })

  transport.dispose()
  transport.dispose()
  expect({
    started: transport.started,
    subscriptionListeners: provider.listenerCount('data:subscription')
  }).toEqual({
    started: false,
    subscriptionListeners: 0
  })
})

it('keeps an HTTP Provider continuation after the client response closes and applies a late result', async () => {
  const provider = new FakeProvider()
  const transport = createHttpRpcTransport({
    provider,
    accounts: { getSelectedAddresses: () => ['0x1111111111111111111111111111111111111111'] },
    store: { endOriginSession: () => undefined },
    origins: {
      updateOrigin: (payload: RPCRequestPayload) => ({
        payload: { ...payload, _origin: 'http-origin' },
        chainId: '0x1'
      }),
      isTrusted: async () => true
    } as never,
    handleAgentRequest: async () => undefined,
    createConnectionId: () => 'http-connection'
  })
  const request = Object.assign(new EventEmitter(), {
    headers: { origin: 'https://app.example' },
    method: 'POST'
  })
  const response = Object.assign(new EventEmitter(), {
    body: '',
    destroyed: false,
    headers: {} as Record<string, string>,
    status: 0,
    writableEnded: false,
    setHeader(name: string, value: string) {
      this.headers[name] = value
    },
    writeHead(status: number) {
      this.status = status
      return this
    },
    end(body = '') {
      this.body = body
      this.writableEnded = true
      return this
    }
  })

  transport.start()
  transport.handler(request as never, response as never)
  request.emit(
    'data',
    Buffer.from(JSON.stringify({ id: 13, jsonrpc: '2.0', method: 'eth_blockNumber', params: [] }))
  )
  request.emit('end')
  await Promise.resolve()
  await Promise.resolve()

  expect(provider.callback).toEqual(expect.any(Function))
  expect(provider.principal).toMatchObject({
    kind: 'rpc',
    transport: 'http',
    origin: 'app.example',
    connectionId: 'http-connection'
  })
  response.destroyed = true
  response.emit('close')
  provider.callback?.({ id: 13, jsonrpc: '2.0', result: '0x10' })

  expect(response.status).toBe(200)
  expect(JSON.parse(response.body)).toEqual({ id: 13, jsonrpc: '2.0', result: '0x10' })
  transport.dispose()
})
