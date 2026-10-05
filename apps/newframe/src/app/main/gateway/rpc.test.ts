import { expect, it } from 'bun:test'

import type { RPCRequestPayload, RPCResponsePayload } from '../../../shared/domain/rpc.ts'
import { createExtensionGateway } from './extension.ts'
import {
  createAiSessionClientSource,
  createLocalApiSource,
  createMainProcessSource,
  isRequestSource
} from './requestSource.ts'
import { createRpcGateway } from './rpc.ts'

const request = (method: string): RPCRequestPayload => ({
  id: 1,
  jsonrpc: '2.0',
  method,
  params: method === 'personal_sign' ? ['0x1234', 'account'] : [],
  _origin: 'origin-id'
})

it('applies the same admission to external clients and composed main-process calls', async () => {
  const executed: string[] = []
  const replies: RPCResponsePayload[] = []
  const gateway = createRpcGateway({
    isLocked: () => false,
    origins: { hasAccountAccessGrant: async () => false },
    selectedAddresses: () => ['account'],
    handle(payload, respond) {
      executed.push(payload.method)
      respond({ id: payload.id, jsonrpc: '2.0', result: true })
    }
  })
  const client = createLocalApiSource({ transport: 'http', connectionId: 'client', origin: 'tool' })
  await gateway(request('eth_accounts'), (value) => replies.push(value), client)
  await gateway(request('personal_sign'), (value) => replies.push(value), client)
  await gateway(request('eth_blockNumber'), (value) => replies.push(value), client)
  await gateway(
    request('personal_sign'),
    (value) => replies.push(value),
    createMainProcessSource('replacement')
  )
  expect(executed).toEqual(['eth_blockNumber', 'personal_sign'])
  expect(replies[0]).toMatchObject({ result: [] })
  expect(replies[1]).toMatchObject({ error: { code: 4001 } })
})

it('rejects copied sources and stale or out-of-scope AI-session authority before invoking handlers', async () => {
  let active = true
  const source = createAiSessionClientSource({
    sessionId: 'session',
    accountId: 'account',
    expiresAt: Date.now() + 60_000,
    isActive: () => active
  })
  let executions = 0
  const replies: RPCResponsePayload[] = []
  const gateway = createRpcGateway({
    isLocked: () => false,
    selectedAddresses: () => ['account'],
    handle() {
      executions++
    }
  })
  expect(source.participant).toBe('local-api-client')
  expect(isRequestSource({ ...source })).toBe(false)
  await gateway(request('personal_sign'), (value) => replies.push(value), { ...source })
  await gateway(request('wallet_getPermissions'), (value) => replies.push(value), source)
  active = false
  await gateway(request('personal_sign'), (value) => replies.push(value), source)
  expect(executions).toBe(0)
  expect(replies.map((reply) => reply.error?.code)).toEqual([4001, 4001, 4001])
})

it('does not let relayed dapps inherit extension controls or internal account access', async () => {
  let toggles = 0
  const gateway = createExtensionGateway(
    {
      toggleTray: () => {
        toggles++
      }
    },
    {
      accounts: () => ({ accounts: [], selected: '' }),
      select: () => undefined as never,
      request: async () => undefined as never
    }
  )
  const dapp = createLocalApiSource({
    participant: 'dapp',
    dappOrigin: 'https://example.com',
    origin: 'example.com',
    transport: 'websocket',
    connectionId: 'shared-socket',
    capabilities: ['wallet:internal-state']
  })
  const extension = createLocalApiSource({
    participant: 'extension',
    extensionId: 'extension-id',
    origin: 'newframe-extension',
    transport: 'websocket',
    connectionId: 'shared-socket',
    capabilities: ['wallet:internal-state']
  })
  const replies: RPCResponsePayload[] = []
  for (const source of [dapp, extension]) {
    await gateway({
      payload: request('newframe_summon'),
      chainId: '0x1',
      source,
      respond: (reply) => replies.push(reply)
    })
  }
  expect(dapp.capabilities).toEqual([])
  expect(toggles).toBe(1)
  expect(replies[0]).toMatchObject({ error: { code: 4001 } })
  expect(replies[1]).toMatchObject({ result: null })
})

it('settles once when a handler replies then throws, and rejects malformed input without running it', async () => {
  const replies: RPCResponsePayload[] = []
  let calls = 0
  const gateway = createRpcGateway({
    isLocked: () => false,
    selectedAddresses: () => [],
    handle(payload, respond) {
      calls++
      respond({ id: payload.id, jsonrpc: '2.0', result: 'done' })
      throw new Error('private detail')
    }
  })
  await gateway(request('eth_blockNumber'), (reply) => replies.push(reply))
  await gateway({ ...request('eth_blockNumber'), params: null } as unknown as RPCRequestPayload, (reply) =>
    replies.push(reply)
  )
  expect(calls).toBe(1)
  expect(replies).toEqual([
    { id: 1, jsonrpc: '2.0', result: 'done' },
    { id: 1, jsonrpc: '2.0', error: { code: -32600, message: 'Invalid gateway request' } }
  ])
})

it('rejects unlisted methods for every source, including wrapped and prototype-property names', async () => {
  let calls = 0
  const gateway = createRpcGateway({
    isLocked: () => false,
    selectedAddresses: () => [],
    handle() {
      calls++
    }
  })
  const sources = [
    undefined,
    createMainProcessSource('test'),
    createLocalApiSource({ transport: 'http', connectionId: 'client', origin: 'test' }),
    createAiSessionClientSource({
      sessionId: 'session',
      accountId: 'account',
      expiresAt: Date.now() + 60_000,
      isActive: () => true
    })
  ]
  for (const source of sources) {
    for (const method of [
      'eth_signTypedData_v5',
      'personal_unlockAccount',
      'anvil_setBalance',
      'wallet_unknown',
      'constructor',
      '__proto__'
    ]) {
      for (const envelope of [undefined, 'wallet_request', 'caip_request']) {
        const payload = envelope
          ? {
              ...request(envelope),
              params: { chainId: 'eip155:1', session: 'untrusted', request: { method, params: [] } }
            }
          : request(method)
        const replies: RPCResponsePayload[] = []
        await gateway(payload as RPCRequestPayload, (reply) => replies.push(reply), source)
        expect(replies).toEqual([
          { id: 1, jsonrpc: '2.0', error: { code: -32601, message: 'Method not found' } }
        ])
      }
    }
  }
  expect(calls).toBe(0)
})

it('applies the inner method account grant and validates parameters before dispatching wrappers', async () => {
  let granted = false
  const checks: string[] = []
  const handled: RPCRequestPayload[] = []
  const gateway = createRpcGateway({
    isLocked: () => false,
    origins: {
      hasAccountAccessGrant: async (payload) => {
        checks.push(payload.method)
        return granted
      }
    },
    selectedAddresses: () => ['account'],
    handle(payload, respond) {
      handled.push(payload)
      respond({ id: payload.id, jsonrpc: '2.0', result: true })
    }
  })
  const source = createLocalApiSource({ transport: 'http', connectionId: 'client', origin: 'test' })
  const payload = {
    ...request('wallet_request'),
    params: {
      chainId: 'eip155:1',
      request: { method: 'personal_sign', params: ['0x1234', 'account'] }
    }
  } as unknown as RPCRequestPayload
  const replies: RPCResponsePayload[] = []
  await gateway(payload, (reply) => replies.push(reply), source)
  expect(handled).toHaveLength(0)
  expect(replies[0].error?.code).toBe(4001)
  granted = true
  await gateway(payload, (reply) => replies.push(reply), source)
  expect(checks).toEqual(['personal_sign', 'personal_sign'])
  expect(handled[0]).toMatchObject({ method: 'personal_sign', chainId: '0x1', _origin: 'origin-id' })
  await gateway(
    { ...request('eth_getBalance'), params: ['not-an-address', 'latest'] },
    (reply) => replies.push(reply),
    source
  )
  expect(replies[2].error?.code).toBe(-32602)
  expect(handled).toHaveLength(1)
})

it('admits only registered upstream methods and keeps debugging main-process-only', async () => {
  const handled: string[] = []
  const gateway = createRpcGateway({
    isLocked: () => false,
    selectedAddresses: () => [],
    handle(payload) {
      handled.push(payload.method)
    }
  })
  const client = createLocalApiSource({ transport: 'http', connectionId: 'client', origin: 'test' })
  const trace = { ...request('debug_traceCall'), params: [{}, 'latest', {}] }
  const replies: RPCResponsePayload[] = []
  await gateway(trace, (reply) => replies.push(reply), client)
  expect(replies[0].error?.code).toBe(4001)
  await gateway(trace, (reply) => replies.push(reply), createMainProcessSource('simulation'))
  await gateway(
    { ...request('eth_getBalance'), params: ['0x' + '11'.repeat(20), 'latest'] },
    (reply) => replies.push(reply),
    client
  )
  expect(handled).toEqual(['debug_traceCall', 'eth_getBalance'])
})

it('preserves supported block overrides and pending-transaction options through admission', async () => {
  const handled: RPCRequestPayload[] = []
  const gateway = createRpcGateway({
    isLocked: () => false,
    selectedAddresses: () => [],
    handle(payload, respond) {
      handled.push(payload)
      respond({ id: payload.id, jsonrpc: '2.0', result: true })
    }
  })
  const cases: Array<{ method: string; params: unknown[] }> = [
    { method: 'eth_call', params: [{ to: '0x' + '11'.repeat(20) }, 'latest', {}, { time: '0x1234' }] },
    ...[undefined, false, true].flatMap((fullTransactions) => [
      {
        method: 'eth_subscribe',
        params: ['newPendingTransactions', ...(fullTransactions === undefined ? [] : [fullTransactions])]
      },
      {
        method: 'eth_newPendingTransactionFilter',
        params: fullTransactions === undefined ? [] : [fullTransactions]
      }
    ])
  ]
  for (const { method, params } of cases) {
    const payload = { ...request(method), params }
    const replies: RPCResponsePayload[] = []
    await gateway(payload, (reply) => replies.push(reply))
    expect(handled.at(-1)).toEqual(payload)
    expect(replies).toEqual([{ id: 1, jsonrpc: '2.0', result: true }])
  }
  expect(handled).toHaveLength(cases.length)
})

it('rejects malformed overrides and pending-transaction options before forwarding', async () => {
  let calls = 0
  const gateway = createRpcGateway({
    isLocked: () => false,
    selectedAddresses: () => [],
    handle() {
      calls++
    }
  })
  const cases: Array<{ method: string; params: unknown[] }> = [
    { method: 'eth_call', params: [{}, 'latest', {}, true] },
    { method: 'eth_call', params: [{}, 'latest', {}, {}, {}] },
    { method: 'eth_subscribe', params: ['newPendingTransactions', 'true'] },
    { method: 'eth_subscribe', params: ['logs', true] },
    { method: 'eth_newPendingTransactionFilter', params: ['true'] }
  ]
  for (const { method, params } of cases) {
    const replies: RPCResponsePayload[] = []
    await gateway({ ...request(method), params }, (reply) => replies.push(reply))
    expect(replies).toEqual([
      { id: 1, jsonrpc: '2.0', error: { code: -32602, message: 'Invalid method parameters' } }
    ])
  }
  expect(calls).toBe(0)
})

it('gives dapps no accounts and no chain reads while locked, before any other check', async () => {
  let locked = true
  const executed: string[] = []
  const replies: RPCResponsePayload[] = []
  const gateway = createRpcGateway({
    isLocked: () => locked,
    origins: { hasAccountAccessGrant: async () => true },
    selectedAddresses: () => ['account'],
    handle(payload, respond) {
      executed.push(payload.method)
      respond({ id: payload.id, jsonrpc: '2.0', result: true })
    }
  })
  const dapp = createLocalApiSource({ transport: 'http', connectionId: 'dapp', origin: 'dapp.example' })
  await gateway(request('eth_accounts'), (value) => replies.push(value), dapp)
  await gateway(request('eth_blockNumber'), (value) => replies.push(value), dapp)
  await gateway(request('not_a_method'), (value) => replies.push(value), dapp)
  await gateway(
    request('eth_blockNumber'),
    (value) => replies.push(value),
    createMainProcessSource('internal')
  )
  locked = false
  await gateway(request('eth_blockNumber'), (value) => replies.push(value), dapp)

  expect(replies.map((reply) => reply.result ?? reply.error?.code)).toEqual([[], 4100, 4100, true, true])
  expect(executed).toEqual(['eth_blockNumber', 'eth_blockNumber'])
})
