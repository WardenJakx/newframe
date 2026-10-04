import { expect, it, mock } from 'bun:test'
import http from 'node:http'

import { SocksProxyAgent } from 'socks-proxy-agent'

import { createOutbound, OutboundClosedError } from './index.ts'

it('sends remote traffic through its transport only while open, and loopback always directly', async () => {
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response('local') })
  const remote = mock(async () => new Response('remote'))
  const outbound = createOutbound(remote)
  const changes: boolean[] = []
  outbound.subscribe((open) => changes.push(open))

  expect(await outbound.request('https://rpc.example').catch((error: unknown) => error)).toBeInstanceOf(
    OutboundClosedError
  )
  expect(() => outbound.openWebSocket('wss://rpc.example')).toThrow(OutboundClosedError)
  expect(await (await outbound.request(server.url)).text()).toBe('local')

  outbound.setOpen(true)
  outbound.setOpen(true)
  expect(await (await outbound.request('https://rpc.example')).text()).toBe('remote')
  outbound.setOpen(false)

  expect(changes).toEqual([true, false])
  expect(remote).toHaveBeenCalledTimes(1)
  await server.stop(true)
})

it('keeps notifying listeners when one of them throws', () => {
  const outbound = createOutbound(mock())
  const after = mock()
  outbound.subscribe(() => {
    throw new Error('listener failed')
  })
  outbound.subscribe(after)

  outbound.setOpen(true)
  outbound.setOpen(false)

  expect(after.mock.calls).toEqual([[true], [false]])
})

it('holds remote traffic closed over Tor until Tor connects, and closes again if Tor drops', () => {
  const outbound = createOutbound(mock())
  const changes: boolean[] = []
  outbound.subscribe((open) => changes.push(open))

  outbound.setRoute({ via: 'tor', socksPort: null })
  outbound.setOpen(true)
  expect(outbound.isOpen()).toBe(false)
  expect(() => outbound.openWebSocket('wss://rpc.example')).toThrow(OutboundClosedError)

  outbound.setRoute({ via: 'tor', socksPort: 9050 })
  outbound.setRoute({ via: 'tor', socksPort: null })

  expect(changes).toEqual([true, false])
})

it('holds Node default-agent connections to the same lock and route', () => {
  const outbound = createOutbound(mock())
  const direct = new http.Agent()
  const agent = outbound.nodeAgent(direct)
  const connect = (host: string) =>
    agent.connect({} as http.ClientRequest, { host, port: 443, secureEndpoint: true })

  expect(connect('127.0.0.1')).toBe(direct)
  expect(connect('::1')).toBe(direct)
  expect(() => connect('relay.example')).toThrow(OutboundClosedError)

  outbound.setOpen(true)
  expect(connect('relay.example')).toBe(direct)

  outbound.setRoute({ via: 'tor', socksPort: 9050 })
  expect(connect('relay.example')).toBeInstanceOf(SocksProxyAgent)
  expect(connect('localhost')).toBe(direct)
})
