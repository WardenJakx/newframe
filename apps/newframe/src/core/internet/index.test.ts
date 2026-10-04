import { expect, it, mock } from 'bun:test'
import http from 'node:http'

import { SocksProxyAgent } from 'socks-proxy-agent'

import { createInternet, InternetClosedError } from './index.ts'

it('sends remote traffic through its transport only while open, and loopback always directly', async () => {
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response('local') })
  const remote = mock(async () => new Response('remote'))
  const internet = createInternet(remote)
  const changes: boolean[] = []
  internet.subscribe((open) => changes.push(open))

  expect(await internet.request('https://rpc.example').catch((error: unknown) => error)).toBeInstanceOf(
    InternetClosedError
  )
  expect(() => internet.openWebSocket('wss://rpc.example')).toThrow(InternetClosedError)
  expect(await (await internet.request(server.url)).text()).toBe('local')

  internet.setOpen(true)
  internet.setOpen(true)
  expect(await (await internet.request('https://rpc.example')).text()).toBe('remote')
  internet.setOpen(false)

  expect(changes).toEqual([true, false])
  expect(remote).toHaveBeenCalledTimes(1)
  await server.stop(true)
})

it('keeps notifying listeners when one of them throws', () => {
  const internet = createInternet(mock())
  const after = mock()
  internet.subscribe(() => {
    throw new Error('listener failed')
  })
  internet.subscribe(after)

  internet.setOpen(true)
  internet.setOpen(false)

  expect(after.mock.calls).toEqual([[true], [false]])
})

it('holds remote traffic closed over Tor until Tor connects, and closes again if Tor drops', () => {
  const internet = createInternet(mock())
  const changes: boolean[] = []
  internet.subscribe((open) => changes.push(open))

  internet.setRoute({ via: 'tor', socksPort: null })
  internet.setOpen(true)
  expect(internet.isOpen()).toBe(false)
  expect(() => internet.openWebSocket('wss://rpc.example')).toThrow(InternetClosedError)

  internet.setRoute({ via: 'tor', socksPort: 9050 })
  internet.setRoute({ via: 'tor', socksPort: null })

  expect(changes).toEqual([true, false])
})

it('holds Node default-agent connections to the same lock and route', () => {
  const internet = createInternet(mock())
  const direct = new http.Agent()
  const agent = internet.nodeAgent(direct)
  const connect = (host: string) =>
    agent.connect({} as http.ClientRequest, { host, port: 443, secureEndpoint: true })

  expect(connect('127.0.0.1')).toBe(direct)
  expect(connect('::1')).toBe(direct)
  expect(() => connect('relay.example')).toThrow(InternetClosedError)

  internet.setOpen(true)
  expect(connect('relay.example')).toBe(direct)

  internet.setRoute({ via: 'tor', socksPort: 9050 })
  expect(connect('relay.example')).toBeInstanceOf(SocksProxyAgent)
  expect(connect('localhost')).toBe(direct)
})
