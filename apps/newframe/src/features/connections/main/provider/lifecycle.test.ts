import { expect, it, mock } from 'bun:test'
import EventEmitter from 'events'

import createCanonicalStore from '../../../../platform/state-store/createCanonicalStore'
import type { Chains } from '../../../networks/main'
import type { AccountRequestPort } from './accountRequestPort'
import { createProxyProvider } from './frameProvider'
import { Provider } from './index'
import { createProviderProxyConnection } from './proxy'
import { createProviderStatePort } from './statePort'

const memoryStorage = {
  getItem: () => null,
  setItem: () => undefined,
  removeItem: () => undefined
}

function createRequestContinuations() {
  const pending = new Map<string, RPCRequestCallback>()
  return {
    pending,
    bind: () => undefined,
    create(respond: RPCRequestCallback, requestId = 'pending-request') {
      pending.set(requestId, respond)
      return requestId
    },
    respond(requestId: string, response: RPCResponsePayload) {
      const callback = pending.get(requestId)
      if (!callback) {
        return false
      }
      pending.delete(requestId)
      callback(response)
      return true
    }
  }
}

function createProviderFixture(chainId?: number, start = false, proxy = new EventEmitter()) {
  const connection = Object.assign(new EventEmitter(), {
    connections: { ethereum: chainId ? { [chainId]: {} } : {} },
    refreshGasFees: async () => {},
    send: () => {}
  }) as unknown as Chains
  const store = createCanonicalStore(memoryStorage).store
  if (chainId) {
    store.setState((state) => {
      state.main.networks.ethereum[chainId] = { ...state.main.networks.ethereum[1], id: chainId, on: true }
    })
  }
  const requests = createRequestContinuations()
  const provider = new Provider({
    accounts: {} as AccountRequestPort,
    chains: connection,
    proxy: proxy as never,
    state: createProviderStatePort(store),
    store,
    reveal: { resolveEntityType: async () => 'unknown' },
    requests
  })
  if (start) {
    provider.start()
  }
  return { connection, provider, proxy, requests }
}

it('round trips a canonical response through the real provider proxy', async () => {
  const proxy = createProviderProxyConnection()
  const { provider } = createProviderFixture(10, false, proxy)
  const frameProvider = createProxyProvider(proxy)
  const responses: unknown[] = []
  proxy.on('payload', (payload) => responses.push(payload))
  frameProvider.setChain('0xa')

  provider.start()
  proxy.start()

  expect(await frameProvider.request<string>({ method: 'eth_chainId' })).toBe('0xa')
  expect(responses).toEqual([{ id: 1, jsonrpc: '2.0', result: '0xa' }])
  expect(responses[0]).not.toHaveProperty('method')

  frameProvider.close()
  provider.dispose()
  proxy.dispose()
})

it('rejects a correlated malformed proxy response', async () => {
  let requestId: string | number | undefined
  const connection = Object.assign(new EventEmitter(), {
    send(payload: { id: string | number }) {
      requestId = payload.id
    }
  })
  const frameProvider = createProxyProvider(connection)
  connection.emit('connect')

  const request = frameProvider.request({ method: 'eth_chainId' })
  connection.emit('payload', {
    id: requestId,
    jsonrpc: '2.0',
    method: 'eth_chainId',
    result: '0x1'
  })

  const error = await request.then(
    () => undefined,
    (reason: unknown) => reason
  )
  expect(error).toBeInstanceOf(Error)
  expect((error as Error).message).toBe('Invalid JSON-RPC response')
  frameProvider.close()
})

it('constructs without listeners and owns an idempotent start/dispose lifecycle', () => {
  const { connection, provider, requests } = createProviderFixture()

  expect(connection.listenerCount('connect')).toBe(0)

  provider.start()
  provider.start()

  const externalResponse = mock()
  const handlerId = requests.create(externalResponse)

  expect(connection.listenerCount('connect')).toBe(1)
  expect(connection.listenerCount('data')).toBe(1)
  expect(connection.listenerCount('update')).toBe(1)

  connection.emit('close')
  expect(requests.pending.has(handlerId)).toBe(true)
  expect(externalResponse.mock.calls.length).toBe(0)

  provider.dispose()
  provider.dispose()

  expect(connection.listenerCount('connect')).toBe(0)
  expect(connection.listenerCount('data')).toBe(0)
  expect(connection.listenerCount('update')).toBe(0)
  expect(requests.pending.has(handlerId)).toBe(true)

  const response = { id: 1, jsonrpc: '2.0' as const, result: 'late result' }
  requests.respond(handlerId, response)
  requests.respond(handlerId, response)
  expect(externalResponse.mock.calls).toEqual([[response]])
  expect(requests.pending.has(handlerId)).toBe(false)
})

it('isolates listeners and state across two provider instances and disposes independently', () => {
  const first = createProviderFixture(10, true)
  const second = createProviderFixture(137, true)
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
