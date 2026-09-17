import { beforeEach, expect, it } from 'bun:test'
import { EventEmitter } from 'events'

import { createProductionOriginsService } from '../../features/connections/main/origins'
import store from '../state-store'
import { type RpcRequestDescription, type RpcRequestHandler } from './request'
import { createWebSocketRpcTransport } from './ws'

class FakeProvider extends EventEmitter {
  readonly requests: RPCRequestPayload[] = []

  send(payload: RPCRequestPayload) {
    this.requests.push(payload)
  }
}

class FakeWebSocketServer extends EventEmitter {
  closed = false

  close() {
    this.closed = true
  }
}

const extensionRequest = {
  headers: { origin: 'chrome-extension://jdlcmcidcpckmaldjiacnbjeajgnmmgj' },
  url: '/?identity=newframe-extension'
}

let provider: FakeProvider
let server: FakeWebSocketServer
let socket: EventEmitter & {
  id?: string
  readyState: number
  send: (response: string, callback?: (error?: Error) => void) => void
}
let transport: ReturnType<typeof createWebSocketRpcTransport>
let rpcRequests: RpcRequestDescription[]
let handleRpc: RpcRequestHandler

function connect(request = extensionRequest) {
  socket = Object.assign(new EventEmitter(), { readyState: 1, send: () => undefined })
  server.emit('connection', socket, request)
  return socket
}

function request(payload: JSONRPCRequestPayload, target = socket) {
  return new Promise<RPCResponsePayload>((resolve) => {
    target.send = (response, callback) => {
      resolve(JSON.parse(response))
      callback?.()
    }
    target.emit('message', Buffer.from(JSON.stringify(payload)))
  })
}

beforeEach(() => {
  store.getState().trustExtension('jdlcmcidcpckmaldjiacnbjeajgnmmgj', true)
  provider = new FakeProvider()
  server = new FakeWebSocketServer()
  rpcRequests = []
  handleRpc = async (rpcRequest) => {
    rpcRequests.push(rpcRequest)
    const payload = { ...rpcRequest.rawPayload, _origin: 'origin-id' }
    const handled = await rpcRequest.postValidationInterceptor?.({
      payload,
      chainId: '0x1',
      respond: (response, reason = 'provider') => rpcRequest.writeResponse(response, reason)
    })
    if (!handled) {
      rpcRequest.writeResponse({ id: payload.id, jsonrpc: payload.jsonrpc, result: 'ok' }, 'provider')
    }
  }
  const origins = createProductionOriginsService(
    store,
    { current: () => undefined, routeRequest: () => undefined } as never,
    { cancel: () => true, create: (_respond, id = 'origin-request') => id }
  )
  transport = createWebSocketRpcTransport({
    provider,
    store: { endOriginSession: (id) => store.getState().endOriginSession(id) },
    origins,
    requestHandler: (rpcRequest) => handleRpc(rpcRequest),
    windows: { toggleTray: () => undefined },
    createServer: () => server,
    createConnectionId: () => 'connection-1',
    openReadyState: 1
  })
  transport.start({} as never)
  connect()
})

it('handles direct extension chain identity locally', async () => {
  const chain = await request({ id: 9, jsonrpc: '2.0', method: 'eth_chainId', params: [] })
  const network = await request({ id: 10, jsonrpc: '2.0', method: 'net_version', params: [] })

  expect({ chain, network, providerRequests: provider.requests }).toEqual({
    chain: { id: 9, jsonrpc: '2.0', result: '0x1' },
    network: { id: 10, jsonrpc: '2.0', result: 1 },
    providerRequests: []
  })
})

it('reopens extension approval only for an explicit internal retry', async () => {
  const id = 'retry-test'
  store.getState().trustExtension(id, false)
  const internal = connect({
    headers: { origin: `moz-extension://${id}` },
    url: '/?identity=newframe-extension&scope=internal'
  })
  const payload = {
    id: 30,
    jsonrpc: '2.0',
    method: 'frame_requestExtensionConnection',
    params: []
  } satisfies JSONRPCRequestPayload

  for (const approved of [false, true]) {
    const response = request(payload, internal)
    expect(store.getState().view.notify).toBe('extensionConnect')
    store.getState().trustExtension(id, approved)
    expect(response).resolves.toMatchObject(approved ? { result: '0x1' } : { error: { code: 4001 } })
  }

  const proxied = connect({
    headers: { origin: `moz-extension://${id}` },
    url: '/?identity=newframe-extension&scope=internal'
  })
  store.getState().trustExtension(id, false)
  const denied = await request({ ...payload, __frameOrigin: 'https://example.com' } as never, proxied)
  expect(denied).toMatchObject({ error: { code: 4001 } })
  expect(store.getState().main.knownExtensions[id]).toBe(false)
})

it.each([true, false])('gates unpacked Chrome RPC, approved=%s', async (approved) => {
  const id = `unpacked-chrome-${approved}`
  const target = connect({
    headers: { origin: `chrome-extension://${id}` },
    url: '/?identity=newframe-extension&scope=internal'
  })
  const response = request({ id: 9, jsonrpc: '2.0', method: 'eth_chainId', params: [] }, target)

  expect(store.getState().view).toMatchObject({
    notify: 'extensionConnect',
    notifyData: { browser: 'chrome', id }
  })
  store.getState().trustExtension(id, approved)
  expect(response).resolves.toMatchObject(approved ? { result: '0x1' } : { error: { code: 4001 } })
})

it('derives socket identity and internal capability instead of trusting payload identity', async () => {
  await request({
    id: 10,
    jsonrpc: '2.0',
    method: 'eth_blockNumber',
    params: [],
    principal: { kind: 'renderer' }
  } as JSONRPCRequestPayload)
  const internal = connect({ ...extensionRequest, url: '/?identity=newframe-extension&scope=internal' })
  await request({ id: 11, jsonrpc: '2.0', method: 'frame_getOriginStatus', params: [] }, internal)

  expect(rpcRequests.map(({ identity }) => identity)).toEqual([
    {
      transport: 'websocket',
      origin: 'newframe-extension',
      connectionId: 'connection-1',
      capabilities: []
    },
    {
      transport: 'websocket',
      origin: 'newframe-extension',
      connectionId: 'connection-1',
      capabilities: ['wallet:internal-state']
    }
  ])
})

it('drops a late response after socket close', async () => {
  let pending: RpcRequestDescription | undefined
  const sent: string[] = []
  handleRpc = async (rpcRequest) => {
    pending = rpcRequest
  }
  socket.send = (response) => sent.push(response)

  socket.emit(
    'message',
    Buffer.from(JSON.stringify({ id: 12, jsonrpc: '2.0', method: 'eth_blockNumber', params: [] }))
  )
  await Bun.sleep(0)
  socket.readyState = 3
  socket.emit('close')
  pending?.writeResponse({ id: 12, jsonrpc: '2.0', result: 'late' }, 'provider')

  expect(sent).toEqual([])
  expect(socket.listenerCount('message')).toBe(0)
})

it('removes listeners and closes its server on dispose', () => {
  expect({
    provider: provider.listenerCount('data:subscription'),
    socket: socket.listenerCount('message'),
    started: transport.started
  }).toEqual({ provider: 1, socket: 1, started: true })

  transport.dispose()
  transport.dispose()
  expect({
    provider: provider.listenerCount('data:subscription'),
    serverClosed: server.closed,
    socket: socket.listenerCount('message'),
    started: transport.started
  }).toEqual({ provider: 0, serverClosed: true, socket: 0, started: false })
})

it.each([
  ['https://cdn.example/favicon.ico', true],
  ['data:image/png;base64,iVBORw0KGgoBAgM=', true],
  ['http://cdn.example/favicon.ico', false],
  ['data:text/html;base64,PGgxPm5vcGU8L2gxPg==', false],
  ['https://user:secret@cdn.example/favicon.ico', false],
  [`https://cdn.example/${'x'.repeat(4096)}`, false]
] as const)('sanitizes proxied favicon metadata, accepted=%s', async (source, accepted) => {
  await request({
    id: 88,
    jsonrpc: '2.0',
    method: 'web3_clientVersion',
    params: [],
    __frameOrigin: 'https://example.com',
    __frameFavicon: source
  } as never)

  const captured = rpcRequests.at(-1)
  expect(captured?.rawPayload).not.toHaveProperty('__frameFavicon')
  expect(captured?.updateOrigin?.faviconSource).toBe(accepted ? source : undefined)
})

it('strips favicon metadata from ordinary WebSocket requests', async () => {
  const ordinary = connect({ headers: { origin: 'https://ordinary.test' }, url: '/' })
  await request(
    {
      id: 89,
      jsonrpc: '2.0',
      method: 'web3_clientVersion',
      params: [],
      __frameFavicon: 'https://cdn.example/favicon.ico'
    } as never,
    ordinary
  )

  const captured = rpcRequests.at(-1)
  expect(captured?.rawPayload).not.toHaveProperty('__frameFavicon')
  expect(captured?.updateOrigin?.faviconSource).toBeUndefined()
})
