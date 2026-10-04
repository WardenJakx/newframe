import { expect, it, mock } from 'bun:test'

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
