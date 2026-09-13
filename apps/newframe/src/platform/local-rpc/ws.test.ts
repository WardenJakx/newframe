import { beforeEach, expect, it } from 'bun:test'
import { EventEmitter } from 'events'

import { createProductionOriginsService } from '../../features/connections/main/origins'
import store from '../state-store'
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
    origins: createProductionOriginsService(
      store,
      {
        current: () => undefined,
        routeRequest: () => undefined
      } as never,
      {
        cancel: () => true,
        create: (_respond, requestId = 'origin-request') => requestId
      }
    ),
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

it('reopens desktop approval on explicit retry and settles repeated declines', async () => {
  const origin = 'moz-extension://retry-test'
  const extensionId = 'retry-test'
  store.getState().trustExtension(extensionId, false)
  const target = connect({
    headers: { origin },
    url: '/?identity=newframe-extension&scope=internal'
  })
  const payload = { id: 30, jsonrpc: '2.0', method: 'frame_requestExtensionConnection', params: [] } as const

  for (const approved of [false, true]) {
    const response = request({ ...payload, params: [] }, target)
    expect(store.getState().view.notify).toBe('extensionConnect')
    expect(store.getState().main.knownExtensions[extensionId]).toBeUndefined()
    store.getState().trustExtension(extensionId, approved)
    if (approved) await expect(response).resolves.toMatchObject({ result: '0x1' })
    else await expect(response).resolves.toMatchObject({ error: { code: 4001 } })
  }
  expect(provider.requests).toHaveLength(0)
  transport.dispose()
})

it('does not allow website traffic to reopen a rejected extension approval', async () => {
  const origin = 'moz-extension://blocked-retry-test'
  const extensionId = 'blocked-retry-test'
  store.getState().trustExtension(extensionId, false)
  for (const internal of [false, true]) {
    const target = connect({
      headers: { origin },
      url: `/?identity=newframe-extension${internal ? '&scope=internal' : ''}`
    })
    const response = await request(
      {
        id: 31,
        jsonrpc: '2.0',
        method: 'frame_requestExtensionConnection',
        params: [],
        __frameOrigin: 'https://example.com'
      } as JSONRPCRequestPayload,
      target
    )
    expect(response).toMatchObject({ error: { code: 4001 } })
    expect(store.getState().main.knownExtensions[extensionId]).toBe(false)
  }
  transport.dispose()
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

it('drops a late extension response after socket close without cancelling the Provider callback', async () => {
  let lateResponse: ((response: RPCResponsePayload) => void) | undefined
  const sent: string[] = []
  provider.send = (payload, callback, principal) => {
    provider.requests.push({ payload, principal })
    lateResponse = callback
  }
  socket.send = (response) => {
    sent.push(response)
  }

  socket.emit(
    'message',
    Buffer.from(JSON.stringify({ id: 12, jsonrpc: '2.0', method: 'eth_blockNumber', params: [] }))
  )
  await Promise.resolve()
  await Promise.resolve()

  expect(lateResponse).toEqual(expect.any(Function))
  expect(provider.requests[0].principal).toMatchObject({
    kind: 'rpc',
    transport: 'websocket',
    origin: 'newframe-extension',
    connectionId: 'connection-1'
  })
  socket.readyState = 3
  socket.emit('close')
  lateResponse?.({ id: 12, jsonrpc: '2.0', result: '0xsigned' })

  expect(sent).toEqual([])
  expect(socket.listenerCount('message')).toBe(0)
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

it.each(['trust', 'send', 'after-response'] as const)(
  'settles WebSocket requests once when %s rejects',
  async (failure) => {
    transport.dispose()
    const send = async (payload: RPCRequestPayload, respond?: (response: RPCResponsePayload) => void) => {
      if (failure === 'after-response') respond?.({ id: payload.id, jsonrpc: '2.0', result: '0x1' })
      throw new Error('private failure details')
    }
    transport = createWebSocketRpcTransport({
      provider: Object.assign(provider, { send }),
      accounts: { getSelectedAddresses: () => [] },
      store: { endOriginSession: () => undefined },
      origins: {
        parseFrameExtension: () => undefined,
        updateOrigin: (payload: RPCRequestPayload) => ({ payload, chainId: '0x1' }),
        isTrusted: async () => {
          if (failure === 'trust') throw new Error('private failure details')
          return true
        }
      } as never,
      windows: { toggleTray: () => undefined },
      createServer: () => server,
      openReadyState: 1
    })
    transport.start({} as never)
    connect({ headers: { origin: 'https://app.example' }, url: '/' })
    const responses: RPCResponsePayload[] = []
    socket.send = (response) => {
      responses.push(JSON.parse(response))
    }
    socket.emit(
      'message',
      Buffer.from(JSON.stringify({ id: 22, jsonrpc: '2.0', method: 'eth_accounts', params: [] }))
    )
    await Bun.sleep(0)
    expect(responses).toEqual([
      failure === 'after-response'
        ? { id: 22, jsonrpc: '2.0', result: '0x1' }
        : { id: 22, jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' } }
    ])
    transport.dispose()
    expect(socket.listenerCount('message')).toBe(0)
  }
)
