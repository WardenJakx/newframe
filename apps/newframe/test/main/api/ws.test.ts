import { EventEmitter } from 'events'

import store from '../../../main/store'

const WebSocketMock = {
  OPEN: 1,
  Server: jest.fn()
}
const providerMock = {
  on: jest.fn(),
  send: jest.fn()
}
const accountsMock = {
  getSelectedAddresses: jest.fn(() => [])
}
const windowsMock = {
  toggleTray: jest.fn()
}

jest.mock('ws', () => ({ default: WebSocketMock, ...WebSocketMock }))
jest.mock('../../../main/provider', () => ({ default: providerMock, ...providerMock }))
jest.mock('../../../main/accounts', () => ({ default: accountsMock, ...accountsMock }))
jest.mock('../../../main/windows', () => ({ default: windowsMock, ...windowsMock }))

let ws: any
let WebSocket: any
let socketConnection: any
let mockSocket: any

const extensionRequest = {
  headers: {
    origin: 'chrome-extension://jdlcmcidcpckmaldjiacnbjeajgnmmgj'
  },
  url: '/?identity=newframe-extension'
}

beforeAll(async () => {
  WebSocket = (await import('ws')).default
  ws = (await import('../../../main/api/ws')).default as any
})

beforeEach(() => {
  ;(store.getState().initOrigin as any).mockImplementation(() => {})

  socketConnection = new EventEmitter()
  mockSocket = new EventEmitter()
  mockSocket.readyState = WebSocket.OPEN
  ;(WebSocket.Server as any).mockReturnValueOnce(socketConnection)

  ws()
  socketConnection.emit('connection', mockSocket, extensionRequest)
})

it('always responds to an extension request for chain id with the requested chain id', (done) => {
  const rpcRequest = { id: 9, jsonrpc: '2.0', method: 'eth_chainId', params: [] }

  mockSocket.send = (response: any) => {
    const responsePayload = JSON.parse(response)
    expect(responsePayload.id).toBe(rpcRequest.id)
    expect(responsePayload.jsonrpc).toBe(rpcRequest.jsonrpc)
    expect(responsePayload.result).toBe('0x1')

    done()
  }

  mockSocket.emit('message', JSON.stringify(rpcRequest))
})

it('always responds to an extension request for net version with the requested chain', (done) => {
  const rpcRequest = { id: 9, jsonrpc: '2.0', method: 'net_version', params: [] }

  mockSocket.send = (response: any) => {
    const responsePayload = JSON.parse(response)
    expect(responsePayload.id).toBe(rpcRequest.id)
    expect(responsePayload.jsonrpc).toBe(rpcRequest.jsonrpc)
    expect(responsePayload.result).toBe(1)

    done()
  }

  mockSocket.emit('message', JSON.stringify(rpcRequest))
})

it('derives RPC identity from the socket instead of accepting renderer identity from JSON', (done) => {
  const rpcRequest = {
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
  }

  providerMock.send.mockImplementationOnce((_payload, respond, principal) => {
    expect(principal).toMatchObject({
      kind: 'rpc',
      transport: 'websocket',
      origin: 'newframe-extension'
    })
    expect(principal.connectionId).toEqual(expect.any(String))
    expect(principal.capabilities).toEqual([])
    respond({ id: rpcRequest.id, jsonrpc: '2.0', result: '0x1' })
  })
  mockSocket.send = () => done()

  mockSocket.emit('message', JSON.stringify(rpcRequest))
})

it('grants internal-state capability only to the authenticated companion internal socket', (done) => {
  const internalSocket = new EventEmitter() as any
  internalSocket.readyState = WebSocket.OPEN
  internalSocket.send = () => done()

  providerMock.send.mockImplementationOnce((_payload, respond, principal) => {
    expect(principal).toMatchObject({
      kind: 'rpc',
      transport: 'websocket',
      capabilities: ['wallet:internal-state']
    })
    respond({ id: 11, jsonrpc: '2.0', result: {} })
  })

  socketConnection.emit('connection', internalSocket, {
    ...extensionRequest,
    url: '/?identity=newframe-extension&scope=internal'
  })
  internalSocket.emit(
    'message',
    JSON.stringify({ id: 11, jsonrpc: '2.0', method: 'frame_getOriginStatus', params: [] })
  )
})
