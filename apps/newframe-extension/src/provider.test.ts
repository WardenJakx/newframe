import { expect, it } from 'bun:test'
import { EventEmitter } from 'events'

import InjectedFrameProvider, { type JsonRpcPayload, type ProviderConnection } from './provider'

const address = '0x1111111111111111111111111111111111111111'

class FakeConnection extends EventEmitter implements ProviderConnection {
  readonly requests: JsonRpcPayload[] = []

  constructor(
    private readonly respond: (payload: JsonRpcPayload) => { result?: unknown; error?: unknown } = () => ({
      result: [address]
    })
  ) {
    super()
  }

  send(payload: JsonRpcPayload) {
    this.requests.push(payload)
    this.emit('payload', { id: payload.id, jsonrpc: payload.jsonrpc, ...this.respond(payload) })
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

it('delegates setChain to wallet_switchEthereumChain without changing local chain state', async () => {
  const connection = new FakeConnection(() => ({ result: null }))
  const provider = new InjectedFrameProvider(connection)
  const chainEvents: string[] = []
  provider.on('chainChanged', (chainId: string) => chainEvents.push(chainId))
  provider.connected = true

  expect(await provider.setChain(8453)).toBeNull()
  expect(connection.requests).toEqual([
    {
      id: 1,
      jsonrpc: '2.0',
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x2105' }]
    }
  ])
  expect(provider.chainId).toBeUndefined()
  expect(chainEvents).toEqual([])
})

it('rejects setChain when the desktop rejects the switch', async () => {
  const error = { code: 4902, message: 'Chain does not exist' }
  const connection = new FakeConnection(() => ({ error }))
  const provider = new InjectedFrameProvider(connection)
  provider.connected = true

  expect(provider.setChain('0x1234')).rejects.toEqual(error)
})

it('forwards authoritative chainChanged events after a setChain request', async () => {
  const subscriptionId = 'chain-changed-subscription'
  const connection = new FakeConnection((payload) => ({
    result: payload.method === 'eth_subscribe' ? subscriptionId : null
  }))
  const provider = new InjectedFrameProvider(connection)
  const chainEvents: string[] = []
  provider.connected = true
  provider.on('chainChanged', (chainId: string) => chainEvents.push(chainId))
  await Promise.resolve()

  await provider.setChain('0xa')
  connection.emit('payload', {
    method: 'eth_subscription',
    params: { subscription: subscriptionId, result: '0xa' }
  })

  expect(provider.chainId).toBe('0xa')
  expect(chainEvents).toEqual(['0xa'])
})
