import { expect, it } from 'bun:test'

import { installInternetDefaults, internet, InternetClosedError } from './index.ts'

it('sends libraries that use the global fetch through the internet', async () => {
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response('local') })
  installInternetDefaults()

  expect(await fetch('https://signing.example').catch((error: unknown) => error)).toBeInstanceOf(
    InternetClosedError
  )
  // Loopback still reaches the native fetch rather than recursing into the internet.
  expect(await (await fetch(server.url)).text()).toBe('local')
  expect(internet.isOpen()).toBe(false)
  await server.stop(true)
})
