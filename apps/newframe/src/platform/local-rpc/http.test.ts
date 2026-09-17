import { expect, it } from 'bun:test'
import { EventEmitter } from 'events'

import { createHttpRpcTransport } from './http'
import { type RpcRequestDescription, type RpcRequestHandler, type RpcResponseReason } from './request'

class FakeProvider extends EventEmitter {
  send() {
    return undefined
  }
}

const noRequest: RpcRequestHandler = async () => undefined

function setup(requestHandler: RpcRequestHandler = noRequest) {
  const provider = new FakeProvider()
  const transport = createHttpRpcTransport({
    provider,
    store: { endOriginSession: () => undefined },
    requestHandler,
    handleAgentRequest: async () => undefined,
    createConnectionId: () => 'http-connection'
  })
  return { provider, transport }
}

function fakeResponse() {
  return Object.assign(new EventEmitter(), {
    body: '',
    status: 0,
    writableEnded: false,
    setHeader: () => undefined,
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
}

async function post(transport: ReturnType<typeof createHttpRpcTransport>) {
  const request = Object.assign(new EventEmitter(), {
    headers: { origin: 'https://app.example' },
    method: 'POST'
  })
  const response = fakeResponse()
  transport.handler(request as never, response as never)
  request.emit(
    'data',
    Buffer.from(JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'eth_blockNumber', params: [] }))
  )
  request.emit('end')
  await Bun.sleep(0)
  return response
}

it('owns its provider listener and rejects unsupported HTTP methods', () => {
  const { provider, transport } = setup()
  const request = Object.assign(new EventEmitter(), { headers: {}, method: 'GET' })
  const response = fakeResponse()

  transport.start()
  transport.start()
  transport.handler(request as never, response as never)
  expect({
    body: JSON.parse(response.body),
    listeners: provider.listenerCount('data:subscription'),
    status: response.status
  }).toEqual({ body: { error: 'Permission Denied' }, listeners: 1, status: 401 })

  transport.dispose()
  transport.dispose()
  expect({ listeners: provider.listenerCount('data:subscription'), started: transport.started }).toEqual({
    listeners: 0,
    started: false
  })
})

it.each([
  ['provider', 200],
  ['unauthorized-accounts', 200],
  ['invalid-chain', 401],
  ['permission-denied', 401],
  ['internal-error', 500]
] satisfies Array<[RpcResponseReason, number]>)('maps %s responses to HTTP %d', async (reason, status) => {
  const { transport } = setup(async ({ rawPayload, writeResponse }) => {
    writeResponse({ id: rawPayload.id, jsonrpc: rawPayload.jsonrpc, result: 'ok' }, reason)
  })
  const response = await post(transport)

  expect({ body: JSON.parse(response.body), status: response.status }).toEqual({
    body: { id: 1, jsonrpc: '2.0', result: 'ok' },
    status
  })
  transport.dispose()
})

it('keeps request identity and late delivery tied to the HTTP response', async () => {
  let pending: RpcRequestDescription | undefined
  const { transport } = setup(async (request) => {
    pending = request
  })
  const response = await post(transport)

  response.emit('close')
  pending?.writeResponse({ id: 1, jsonrpc: '2.0', result: 'late' }, 'provider')

  expect(pending?.identity).toMatchObject({
    transport: 'http',
    connectionId: 'http-connection',
    origin: 'app.example'
  })
  expect({ body: JSON.parse(response.body), status: response.status }).toEqual({
    body: { id: 1, jsonrpc: '2.0', result: 'late' },
    status: 200
  })
  transport.dispose()
})
