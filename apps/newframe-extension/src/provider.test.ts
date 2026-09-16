import { expect, it } from 'bun:test'
import { EventEmitter } from 'events'

import InjectedFrameProvider, { type JsonRpcPayload, type ProviderConnection } from './provider'

const address = '0x1111111111111111111111111111111111111111'

class FakeConnection extends EventEmitter implements ProviderConnection {
  readonly requests: JsonRpcPayload[] = []

  send(payload: JsonRpcPayload) {
    this.requests.push(payload)
    this.emit('payload', { id: payload.id, jsonrpc: payload.jsonrpc, result: [address] })
  }
}

it('requests account access when legacy enable is called', async () => {
  const connection = new FakeConnection()
  const provider = new InjectedFrameProvider(connection)
  const enableEvents: string[][] = []
  provider.connected = true
  provider.on('enable', () => enableEvents.push([...provider.accounts]))

  const accounts = await provider.enable()

  expect(connection.requests).toEqual([{ id: 1, jsonrpc: '2.0', method: 'eth_requestAccounts', params: [] }])
  expect({
    accounts,
    cached: provider.accounts,
    selected: provider.selectedAddress,
    coinbase: provider.coinbase
  }).toEqual({
    accounts: [address],
    cached: [address],
    selected: address,
    coinbase: address
  })
  expect(enableEvents).toEqual([[address]])
})
