import { expect, it } from 'bun:test'
import { EventEmitter } from 'events'

import type { RpcRequestDescription } from './request'
import { createWebSocketRpcTransport } from './ws'

class FakeProvider extends EventEmitter {
  send() {
    return undefined
  }
}

class FakeWebSocketServer extends EventEmitter {
  close() {
    return undefined
  }
}

it('adapts a WebSocket message to the shared request contract', async () => {
  const captured: RpcRequestDescription[] = []
  const server = new FakeWebSocketServer()
  const transport = createWebSocketRpcTransport({
    provider: new FakeProvider(),
    store: { endOriginSession: () => undefined },
    origins: {
      parseFrameExtension: () => ({ id: 'extension-id', browser: 'chrome' }),
      isKnownExtension: async () => true
    } as never,
    requestHandler: async (request) => {
      captured.push(request)
    },
    windows: { toggleTray: () => undefined },
    createServer: () => server,
    createConnectionId: () => 'socket-connection',
    openReadyState: 1
  })
  const sent: RPCResponsePayload[] = []
  const socket = Object.assign(new EventEmitter(), {
    readyState: 1,
    send: (response: string, callback?: (error?: Error) => void) => {
      sent.push(JSON.parse(response) as RPCResponsePayload)
      callback?.()
    }
  })
  const payload = {
    id: 1,
    jsonrpc: '2.0',
    method: 'eth_blockNumber',
    params: [],
    __frameOrigin: 'https://app.example',
    __frameFavicon: 'https://cdn.example/icon.png',
    __extensionConnecting: true
  }

  transport.start({} as never)
  server.emit('connection', socket, {
    headers: { origin: 'chrome-extension://extension-id' },
    url: '/?identity=newframe-extension&scope=internal&chainId=5'
  })
  const encoded = Buffer.from(JSON.stringify(payload))
  socket.emit('message', encoded)
  socket.emit('message', [encoded.subarray(0, 10), encoded.subarray(10)])
  socket.emit('message', Uint8Array.from(encoded).buffer)
  await Bun.sleep(0)

  expect(captured).toHaveLength(3)
  const normalized = captured[2]
  expect(normalized.rawPayload as JSONRPCRequestPayload & { __extensionConnecting?: boolean }).toEqual({
    id: 1,
    jsonrpc: '2.0',
    method: 'eth_blockNumber',
    params: [],
    __extensionConnecting: true
  })
  expect(normalized).toMatchObject({
    origin: 'app.example',
    chainHint: '0x5',
    identity: {
      transport: 'websocket',
      connectionId: 'socket-connection',
      origin: 'app.example',
      capabilities: ['wallet:internal-state']
    },
    updateOrigin: {
      connectionMessage: true,
      faviconSource: 'https://cdn.example/icon.png'
    },
    session: { refresh: 'omit' }
  })

  normalized.writeResponse({ id: 1, jsonrpc: '2.0', result: 'ok' }, 'provider')
  expect(sent).toEqual([{ id: 1, jsonrpc: '2.0', result: 'ok' }])
})
