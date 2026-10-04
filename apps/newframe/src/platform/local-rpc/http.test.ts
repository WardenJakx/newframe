import { expect, it } from 'bun:test'
import { EventEmitter } from 'events'

import { MAX_RPC_REQUEST_BYTES } from '@newframe/schema/json-rpc'
import type { RPCResponsePayload } from '@newframe/schema/rpc'

import { createHttpRpcTransport } from './http.ts'
import type { RpcRequestDescription } from './request.ts'

class FakeProvider extends EventEmitter {
  send() {
    return undefined
  }
}

it('adapts an HTTP exchange to the shared request contract', async () => {
  let captured: RpcRequestDescription | undefined
  const transport = createHttpRpcTransport({
    provider: new FakeProvider(),
    store: { endOriginSession: () => undefined },
    requestHandler: async (request) => {
      captured = request
    },
    createConnectionId: () => 'http-connection'
  })
  const request = Object.assign(new EventEmitter(), {
    headers: {
      origin: 'https://app.example',
      'x-newframe-chain-id': '5'
    },
    method: 'POST',
    url: '/'
  })
  const response = Object.assign(new EventEmitter(), {
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
  const payload = { id: 1, jsonrpc: '2.0', method: 'eth_blockNumber', params: [] } as const

  transport.handler(request as never, response as never)
  request.emit('data', Buffer.from(JSON.stringify(payload)))
  request.emit('end')
  await Bun.sleep(0)

  const normalized = captured as unknown as RpcRequestDescription
  expect(normalized).toMatchObject({
    rawPayload: payload,
    origin: 'app.example',
    chainHint: '0x5',
    identity: {
      transport: 'http',
      connectionId: 'http-connection',
      origin: 'app.example'
    },
    session: { refresh: 'before-validation' }
  })
  expect(normalized.acceptsProviderResponse()).toBe(true)

  normalized.writeResponse(
    { id: payload.id, jsonrpc: payload.jsonrpc, error: { code: 4001, message: 'denied' } },
    'permission-denied'
  )

  expect({ body: JSON.parse(response.body) as RPCResponsePayload, status: response.status }).toEqual({
    body: { id: 1, jsonrpc: '2.0', error: { code: 4001, message: 'denied' } },
    status: 401
  })
  expect(normalized.acceptsProviderResponse()).toBe(false)
})

it('rejects an oversized HTTP body before dispatch', () => {
  let dispatched = false
  const transport = createHttpRpcTransport({
    provider: new FakeProvider(),
    store: { endOriginSession: () => undefined },
    requestHandler: async () => {
      dispatched = true
    }
  })
  const request = Object.assign(new EventEmitter(), { headers: {}, method: 'POST', url: '/' })
  const response = Object.assign(new EventEmitter(), {
    status: 0,
    writableEnded: false,
    setHeader: () => undefined,
    writeHead(status: number) {
      this.status = status
      return this
    },
    end() {
      this.writableEnded = true
      return this
    }
  })

  transport.handler(request as never, response as never)
  request.emit('data', Buffer.alloc(MAX_RPC_REQUEST_BYTES))
  request.emit('data', Buffer.from('x'))
  request.emit('end')

  expect(response.status).toBe(413)
  expect(response.writableEnded).toBe(true)
  expect(dispatched).toBe(false)
})
