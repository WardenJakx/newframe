import { expect, it } from 'bun:test'

import { installOutboundDefaults, outbound, OutboundClosedError } from './index.ts'

it('sends libraries that use the global fetch through outbound', async () => {
  const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: () => new Response('local') })
  installOutboundDefaults()

  expect(await fetch('https://signing.example').catch((error: unknown) => error)).toBeInstanceOf(
    OutboundClosedError
  )
  // Loopback still reaches the native fetch rather than recursing into outbound.
  expect(await (await fetch(server.url)).text()).toBe('local')
  expect(outbound.isOpen()).toBe(false)
  await server.stop(true)
})
