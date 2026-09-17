import { expect, it } from 'bun:test'

import { createOriginSessionMonitor, createRpcRequestHandler, type RpcRequestDescription } from './request'

const rpc = (method = 'eth_blockNumber'): JSONRPCRequestPayload => ({
  id: 1,
  jsonrpc: '2.0',
  method,
  params: []
})

function setup({
  chainId = '0x1',
  trusted = true,
  send
}: {
  chainId?: unknown
  trusted?: boolean
  send?: (
    payload: RPCRequestPayload,
    respond?: (response: RPCResponsePayload) => void
  ) => void | Promise<void>
} = {}) {
  const forwarded: Array<{ payload: RPCRequestPayload; principal?: unknown }> = []
  const responses: RPCResponsePayload[] = []
  const sessions: string[] = []
  const origins = {
    updateOrigin: (payload: JSONRPCRequestPayload, origin: string) => ({
      payload: { ...payload, _origin: `${origin}-id` },
      chainId
    }),
    isTrusted: async () => trusted
  } as never
  const handler = createRpcRequestHandler({
    provider: {
      send: (payload, respond, principal) => {
        forwarded.push({ payload, principal })
        if (send) {
          return send(payload, respond)
        }
        respond?.({ id: payload.id, jsonrpc: payload.jsonrpc, result: 'ok' })
      }
    },
    accounts: { getSelectedAddresses: () => ['0x1111111111111111111111111111111111111111'] },
    origins
  })
  const run = (rawPayload: JSONRPCRequestPayload, overrides: Partial<RpcRequestDescription> = {}) =>
    handler({
      rawPayload,
      origin: 'app.example',
      identity: { transport: 'http', connectionId: 'connection-1', origin: 'app.example' },
      session: {
        monitor: { extend: (id) => sessions.push(id), dispose: () => undefined },
        refresh: 'after-validation'
      },
      acceptsProviderResponse: () => true,
      writeResponse: (response) => responses.push(response),
      ...overrides
    })

  return { forwarded, responses, run, sessions }
}

it('normalizes one allowed request and applies its provider response', async () => {
  const opened: string[] = []
  const harness = setup({
    send: (payload, respond) =>
      respond?.({ id: payload.id, jsonrpc: payload.jsonrpc, result: 'subscription-1' })
  })
  const payload = rpc('eth_subscribe')

  await harness.run(payload, {
    chainHint: '0x5',
    identity: {
      transport: 'websocket',
      connectionId: 'socket-1',
      origin: 'app.example',
      capabilities: ['wallet:internal-state']
    },
    onSubscriptionOpen: (id) => opened.push(id)
  })

  expect(harness.forwarded[0]).toMatchObject({
    payload: { chainId: '0x5', method: 'eth_subscribe', _origin: 'app.example-id' },
    principal: {
      kind: 'rpc',
      transport: 'websocket',
      connectionId: 'socket-1',
      capabilities: ['wallet:internal-state']
    }
  })
  expect({ opened, responses: harness.responses, sessions: harness.sessions }).toEqual({
    opened: ['subscription-1'],
    responses: [{ id: 1, jsonrpc: '2.0', result: 'subscription-1' }],
    sessions: ['app.example-id']
  })
})

it('rejects invalid chains and unauthorized protected requests before dispatch', async () => {
  const invalid = setup({ chainId: 1 })
  await invalid.run({ ...rpc(), chainId: '1' })

  const accounts = setup({ trusted: false })
  await accounts.run(rpc('eth_accounts'))

  const signing = setup({ trusted: false })
  await signing.run(rpc('personal_sign'))

  expect(invalid.responses[0]).toMatchObject({ error: { code: -1 } })
  expect(accounts.responses[0]).toEqual({ id: 1, jsonrpc: '2.0', result: [] })
  expect(signing.responses[0]).toMatchObject({ error: { code: 4001 } })
  expect([...invalid.forwarded, ...accounts.forwarded, ...signing.forwarded]).toEqual([])
})

it('settles provider work once and rejects side effects for an ended transport response', async () => {
  const opened: string[] = []
  const settled = setup({
    send: async (payload, respond) => {
      const response = { id: payload.id, jsonrpc: payload.jsonrpc, result: 'subscription-1' }
      respond?.(response)
      respond?.(response)
      throw new Error('private failure')
    }
  })
  await settled.run(rpc('eth_subscribe'), { onSubscriptionOpen: (id) => opened.push(id) })

  const ended = setup({
    send: (payload, respond) =>
      respond?.({ id: payload.id, jsonrpc: payload.jsonrpc, result: 'subscription-2' })
  })
  await ended.run(rpc('eth_subscribe'), {
    acceptsProviderResponse: () => false,
    onSubscriptionOpen: (id) => opened.push(id)
  })

  expect(opened).toEqual(['subscription-1'])
  expect(settled.responses).toEqual([{ id: 1, jsonrpc: '2.0', result: 'subscription-1' }])
  expect(ended.responses).toEqual([])
})

it('preserves session refresh timing and disposes active timers', async () => {
  const before = setup({ chainId: 1 })
  await before.run(rpc(), {
    session: {
      monitor: { extend: (id) => before.sessions.push(id), dispose: () => undefined },
      refresh: 'before-validation'
    }
  })
  const after = setup({ chainId: 1 })
  await after.run(rpc())
  expect({ before: before.sessions, after: after.sessions }).toEqual({
    before: ['app.example-id'],
    after: []
  })

  const cleared: number[] = []
  let nextTimer = 0
  const monitor = createOriginSessionMonitor({
    store: { endOriginSession: () => undefined },
    timers: {
      setTimeout: () => ++nextTimer as unknown as ReturnType<typeof setTimeout>,
      clearTimeout: (timer) => cleared.push(timer as unknown as number)
    }
  })
  monitor.extend('origin-1')
  monitor.extend('origin-1')
  monitor.dispose()

  expect(cleared).toEqual([1, 2])
})
