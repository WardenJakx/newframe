import { expect, it } from 'bun:test'
import { EventEmitter } from 'events'

import { createHttpRpcTransport } from './http'

class FakeProvider extends EventEmitter {
  readonly requests: RPCRequestPayload[] = []

  send(payload: RPCRequestPayload) {
    this.requests.push(payload)
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
