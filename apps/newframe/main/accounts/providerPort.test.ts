import { expect, it, mock } from 'bun:test'

import { createDeferredAccountChainRpcPort } from './providerPort'

const payload = {
  id: 1,
  jsonrpc: '2.0',
  method: 'eth_blockNumber',
  params: []
} as unknown as RPCRequestPayload

it('fails closed until the account chain RPC capability is connected', () => {
  const deferred = createDeferredAccountChainRpcPort()

  expect(() => deferred.port.send(payload, mock())).toThrow('Account chain RPC capability is not connected')
})

it('delegates to the active capability and restores nested bindings on disconnect', async () => {
  const deferred = createDeferredAccountChainRpcPort()
  const first = {
    send: mock(),
    sendAsync: mock(),
    getL1GasCost: mock(async () => 1n),
    on: mock(),
    off: mock()
  }
  const second = {
    send: mock(),
    sendAsync: mock(),
    getL1GasCost: mock(async () => 2n),
    on: mock(),
    off: mock()
  }
  const disconnectFirst = deferred.connect(first)
  const disconnectSecond = deferred.connect(second)

  await expect(deferred.port.getL1GasCost({} as never)).resolves.toBe(2n)
  disconnectSecond()
  await expect(deferred.port.getL1GasCost({} as never)).resolves.toBe(1n)
  disconnectFirst()
  expect(() => deferred.port.send(payload, mock())).toThrow('Account chain RPC capability is not connected')
})
