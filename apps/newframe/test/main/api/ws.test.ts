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
  }
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
