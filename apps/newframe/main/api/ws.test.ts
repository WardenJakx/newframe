import { beforeEach, expect, it } from 'bun:test'
import { EventEmitter } from 'events'

import store from '../store'
import { createProductionOriginsService } from './origins'
import { createWebSocketRpcTransport } from './ws'

class FakeProvider extends EventEmitter {
  readonly requests: Array<{ payload: RPCRequestPayload; principal?: unknown }> = []
  respond?: (payload: RPCRequestPayload, principal?: unknown) => RPCResponsePayload

  send(payload: RPCRequestPayload, callback?: (response: RPCResponsePayload) => void, principal?: unknown) {
    this.requests.push({ payload, principal })
    const response = this.respond?.(payload, principal)
    if (response && callback) callback(response)
  }
}

class FakeWebSocketServer extends EventEmitter {
  closed = false

  close() {
    this.closed = true
  }
}

const extensionRequest = {
  headers: {
    origin: 'chrome-extension://jdlcmcidcpckmaldjiacnbjeajgnmmgj'
  },
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

function connect(request = extensionRequest) {
  socket = new EventEmitter() as typeof socket
  socket.readyState = 1
  socket.send = () => undefined
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
  provider = new FakeProvider()
  server = new FakeWebSocketServer()
  transport = createWebSocketRpcTransport({
    provider,
    accounts: { getSelectedAddresses: () => [] },
    store: { endOriginSession: (originId) => store.getState().endOriginSession(originId) },
    origins: createProductionOriginsService(store, {
      current: () => undefined,
      routeRequest: () => undefined
    } as never),
    windows: { toggleTray: () => undefined },
    createServer: () => server,
    createConnectionId: () => 'connection-1',
    openReadyState: 1
  })
  transport.start({} as never)
  connect()
})

it('returns extension-local chain identity without forwarding it to the provider', async () => {
  const chain = await request({ id: 9, jsonrpc: '2.0', method: 'eth_chainId', params: [] })
  const network = await request({ id: 10, jsonrpc: '2.0', method: 'net_version', params: [] })

  expect({ chain, network, forwarded: provider.requests }).toEqual({
    chain: { id: 9, jsonrpc: '2.0', result: '0x1' },
    network: { id: 10, jsonrpc: '2.0', result: 1 },
    forwarded: []
  })
})

it('derives ordinary RPC identity from the socket instead of accepting renderer identity', async () => {
  provider.respond = (payload) => ({
    id: payload.id,
    jsonrpc: '2.0',
    result: '0x1'
  })

  await request({
    id: 10,
    jsonrpc: '2.0',
    method: 'eth_blockNumber',
    params: [],
    principal: {
      kind: 'renderer',
      role: 'wallet-ui',
      entrypoint: 'tray',
      webContentsId: 1,
      windowInstanceId: 'forged'
    }
  } as JSONRPCRequestPayload)

  expect(provider.requests[0].principal).toMatchObject({
    kind: 'rpc',
    transport: 'websocket',
    origin: 'newframe-extension',
    connectionId: 'connection-1',
    capabilities: []
  })
})

it('grants internal-state capability only to the authenticated companion internal socket', async () => {
  provider.respond = (payload) => ({
    id: payload.id,
    jsonrpc: '2.0',
    result: {}
  })
  const internalSocket = connect({
    ...extensionRequest,
    url: '/?identity=newframe-extension&scope=internal'
  })

  await request({ id: 11, jsonrpc: '2.0', method: 'frame_getOriginStatus', params: [] }, internalSocket)

  expect(provider.requests[0].principal).toMatchObject({
    kind: 'rpc',
    transport: 'websocket',
    capabilities: ['wallet:internal-state']
  })
})

it('removes provider and socket listeners and closes its server on dispose', () => {
  expect({
    providerSubscriptions: provider.listenerCount('data:subscription'),
    socketMessages: socket.listenerCount('message'),
    started: transport.started
  }).toEqual({
    providerSubscriptions: 1,
    socketMessages: 1,
    started: true
  })

  transport.dispose()
  transport.dispose()

  expect({
    providerSubscriptions: provider.listenerCount('data:subscription'),
    serverClosed: server.closed,
    socketMessages: socket.listenerCount('message'),
    started: transport.started
  }).toEqual({
    providerSubscriptions: 0,
    serverClosed: true,
    socketMessages: 0,
    started: false
  })
})
