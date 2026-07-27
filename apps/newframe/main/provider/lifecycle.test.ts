import EventEmitter from 'events'
import { expect, it } from 'bun:test'

import type { Chains } from '../chains'
import { Provider } from './index'
import type { AccountRequestPort } from './accountRequestPort'
import { createProviderStatePort } from './statePort'
import createCanonicalStore from '../store/createCanonicalStore'

const memoryStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined
}

it('constructs without listeners and owns an idempotent start/dispose lifecycle', () => {
  const connection = Object.assign(new EventEmitter(), {
    connections: {},
    refreshGasFees: async () => {},
    send: () => {}
  }) as unknown as Chains
  const store = createCanonicalStore(memoryStorage).store
  const proxy = new EventEmitter()
  const provider = new Provider({
    accounts: {} as AccountRequestPort,
    chains: connection,
    proxy: proxy as never,
    state: createProviderStatePort(store),
    store,
    reveal: { resolveEntityType: async () => 'unknown' }
  })

  expect(connection.listenerCount('connect')).toBe(0)

  provider.start()
  provider.start()

  expect(connection.listenerCount('connect')).toBe(1)
  expect(connection.listenerCount('data')).toBe(1)
  expect(connection.listenerCount('update')).toBe(1)

  provider.dispose()
  provider.dispose()

  expect(connection.listenerCount('connect')).toBe(0)
  expect(connection.listenerCount('data')).toBe(0)
  expect(connection.listenerCount('update')).toBe(0)
})

it('isolates listeners and state across two provider instances and disposes independently', () => {
  const createInstance = (chainId: number) => {
    const connection = Object.assign(new EventEmitter(), {
      connections: {},
      refreshGasFees: async () => {},
      send: () => {}
    }) as unknown as Chains
    const proxy = new EventEmitter()
    const store = createCanonicalStore(memoryStorage).store
    store.setState((state) => ({
      ...state,
      main: {
        ...state.main,
        networks: {
          ...state.main.networks,
          ethereum: {
            ...state.main.networks.ethereum,
            [chainId]: {
              ...state.main.networks.ethereum[1],
              id: chainId,
              on: true
            }
          }
        }
      }
    }))
    const provider = new Provider({
      accounts: {} as AccountRequestPort,
      chains: connection,
      proxy: proxy as never,
      state: createProviderStatePort(store),
      store,
      reveal: { resolveEntityType: async () => 'unknown' }
    })
    provider.start()
    return { connection, provider, proxy, store }
  }

  const first = createInstance(10)
  const second = createInstance(137)
  const firstResponse: RPCResponsePayload[] = []
  const secondResponse: RPCResponsePayload[] = []

  first.provider.getChainId(
    { id: 1, jsonrpc: '2.0', method: 'eth_chainId', params: [], _origin: 'first.test' },
    (response) => firstResponse.push(response),
    { id: 10, type: 'ethereum' }
  )
  second.provider.getChainId(
    { id: 2, jsonrpc: '2.0', method: 'eth_chainId', params: [], _origin: 'second.test' },
    (response) => secondResponse.push(response),
    { id: 137, type: 'ethereum' }
  )
  first.provider.dispose()
  second.connection.emit('connect')

  expect({
    first: {
      connected: first.provider.connected,
      proxyListeners: first.proxy.listenerCount('provider:send'),
      response: firstResponse
    },
    second: {
      connected: second.provider.connected,
      proxyListeners: second.proxy.listenerCount('provider:send'),
      response: secondResponse
    }
  }).toEqual({
    first: {
      connected: false,
      proxyListeners: 0,
      response: [{ id: 1, jsonrpc: '2.0', result: '0xa' }]
    },
    second: {
      connected: true,
      proxyListeners: 1,
      response: [{ id: 2, jsonrpc: '2.0', result: '0x89' }]
    }
  })

  second.provider.dispose()
  expect(second.proxy.listenerCount('provider:send')).toBe(0)
})
