import { verifySafeHash } from './integrity.js'
import { afterEach, describe, expect, test } from 'bun:test'
import { createSafeHandler } from '../../../scripts/local-safe/handler.js'
import { createSafeClient, safeServiceNetworks } from './client.js'

const safe = '0x1111111111111111111111111111111111111111'
const owners = ['0x2222222222222222222222222222222222222222', '0x3333333333333333333333333333333333333333']
const servers: ReturnType<typeof Bun.serve>[] = []
afterEach(() => {
  for (const server of servers.splice(0)) server.stop(true)
})
function setup(transform?: (request: Request, response: Response) => Promise<Response>, version = '1.4.1') {
  const handler = createSafeHandler({
    chainId: 31337,
    safe,
    owners,
    threshold: 2,
    nonce: '9007199254740993',
    version
  })
  const server = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    async fetch(request) {
      const response = await handler.fetch(request)
      return transform ? transform(request, response) : response
    }
  })
  servers.push(server)
  const client = createSafeClient({
    request: (url, init) => fetch(url, init),
    networks: { 31337: `${server.url}api` },
    timeoutMs: 100
  })
  return { client, handler }
}
describe('Safe service client over HTTP', () => {
  test('loads every page preserving precise nonces, alternatives and confirmation counts', async () => {
    const { client } = setup()
    const configuration = await client.configuration(31337, safe)
    expect(configuration.nonce).toBe('9007199254740993')
    const pending = await client.pending(31337, safe, configuration)
    expect(pending).toHaveLength(4)
    expect(pending.map((proposal) => proposal.confirmations.length)).toEqual([0, 2, 1, 1])
    expect(pending[0].nonce).toBe(pending[1].nonce)
    expect(pending[3].nonce).toBe('9007199254740995')
  })
  test('rejects identity mismatch and unsafe numeric nonce', async () => {
    for (const replacement of [
      { address: owners[0] },
      { nonce: 9007199254740992 },
      { threshold: 3 },
      { owners: [owners[0], owners[0]] }
    ]) {
      const { client } = setup(async (_, response) =>
        Response.json({ ...(await response.json()), ...replacement })
      )
      await expect(client.configuration(31337, safe)).rejects.toThrow()
    }
  })
  test('rejects malformed transaction fields without a partial result', async () => {
    for (const replacement of [
      { safe: owners[0] },
      { to: 'invalid' },
      { value: 42 },
      { value: (2n ** 256n).toString() },
      { nonce: 9007199254740992 },
      { safeTxHash: '0x12' },
      { data: '0x1' },
      { operation: 2 }
    ]) {
      const { client } = setup(async (request, response) => {
        if (!request.url.includes('/v2/')) return response
        const page = await response.json()
        page.results[0] = { ...page.results[0], ...replacement }
        return Response.json(page)
      })
      const configuration = await client.configuration(31337, safe)
      await expect(client.pending(31337, safe, configuration)).rejects.toThrow()
    }
  })
  test('deduplicates hashes without dropping alternative proposals', async () => {
    const { client } = setup(async (request, response) => {
      if (!request.url.includes('/v2/')) return response
      const page = await response.json()
      page.results.push(page.results[0])
      return Response.json(page)
    })
    const configuration = await client.configuration(31337, safe)
    expect(await client.pending(31337, safe, configuration)).toHaveLength(4)
  })
  test('later-page failure rejects the complete pending refresh', async () => {
    const { client } = setup(async (request, response) =>
      new URL(request.url).searchParams.has('offset') ? Response.json({}, { status: 503 }) : response
    )
    const configuration = await client.configuration(31337, safe)
    await expect(client.pending(31337, safe, configuration)).rejects.toThrow('HTTP 503')
  })
  test('rejects foreign and repeated pagination links', async () => {
    for (const foreign of [true, false]) {
      const { client } = setup(async (request, response) => {
        if (!request.url.includes('/v2/')) return response
        return Response.json({
          ...(await response.json()),
          next: foreign ? 'https://example.org/api/' : request.url
        })
      })
      const configuration = await client.configuration(31337, safe)
      await expect(client.pending(31337, safe, configuration)).rejects.toThrow(
        foreign ? 'Unsafe' : 'progress'
      )
    }
  })
  test('enforces Retry-After without sending another request', async () => {
    const { client, handler } = setup()
    handler.failNext(429, '30')
    await expect(client.configuration(31337, safe)).rejects.toThrow('rate limited')
    await expect(client.configuration(31337, safe)).rejects.toThrow('rate limited')
    expect(handler.requests).toHaveLength(1)
  })
  test('timeout covers a delayed body, and external cancellation stops requests', async () => {
    const { client } = setup(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              setTimeout(() => {
                try {
                  controller.enqueue(new TextEncoder().encode('{}'))
                  controller.close()
                } catch {
                  // The timeout may already have closed the connection.
                }
              }, 300)
            }
          })
        )
    )
    await expect(client.configuration(31337, safe)).rejects.toThrow()
    const abort = new AbortController()
    abort.abort()
    await expect(client.configuration(31337, safe, abort.signal)).rejects.toThrow()
  })
  test('production ignores development overrides', () => {
    expect(
      safeServiceNetworks({ development: false, url: 'http://localhost:1234/api', chainId: '31337' })[31337]
    ).toBeUndefined()
  })
})

test('computes hashes and decodes calldata locally over the real service endpoint', async () => {
  const { client } = setup()
  const configuration = await client.configuration(31337, safe)
  const pending = await client.pending(31337, safe, configuration)
  expect(pending.every((proposal) => proposal.integrity?.status === 'matched')).toBe(true)
  expect(pending[2].localDecoded?.method).toBe('transfer')
  expect(pending[2].localDecoded?.parameters[1].value).toBe('1')
  expect(pending[3].localDecoded).toBeUndefined()
})

test('retains offending proposals when any signed field is changed by the service', async () => {
  for (const replacement of [
    { to: owners[1] },
    { value: '1' },
    { data: '0x01' },
    { operation: 1 },
    { safeTxGas: '1' },
    { baseGas: '1' },
    { gasPrice: '1' },
    { gasToken: owners[1] },
    { refundReceiver: owners[1] },
    { nonce: '9007199254740999' }
  ]) {
    const { client } = setup(async (request, response) => {
      if (!request.url.includes('/v2/')) return response
      const page = await response.json()
      page.results[0] = { ...page.results[0], ...replacement }
      return Response.json(page)
    })
    const configuration = await client.configuration(31337, safe)
    const pending = await client.pending(31337, safe, configuration)
    expect(pending).toHaveLength(4)
    expect(pending[0].integrity?.status).toBe('mismatch')
    expect(pending[0].integrity?.computedHash).not.toBe(pending[0].safeTxHash)
  }
})

test('distinguishes missing fields and versions from inconsistent service descriptions', async () => {
  const { client } = setup(async (request, response) => {
    if (!request.url.includes('/v2/')) return response
    const page = await response.json()
    if (!new URL(request.url).searchParams.has('offset')) delete page.results[0].baseGas
    else page.results[0].dataDecoded.parameters[1].value = '2'
    return Response.json(page)
  })
  const configuration = await client.configuration(31337, safe)
  const pending = await client.pending(31337, safe, configuration)
  expect(pending[0].integrity?.status).toBe('unavailable')
  expect(pending[2].integrity?.status).toBe('mismatch')
  expect(pending[2].integrity?.reason).toContain('description')
  expect(pending[2].localDecoded?.parameters[1].value).toBe('1')
  const unknown = await client.pending(31337, safe, { ...configuration, version: '9.0.0' })
  expect(unknown[1].integrity?.status).toBe('unavailable')
})

test('uses explicit legacy domains and binds modern hashes to the watched chain and Safe', async () => {
  for (const version of ['1.1.1', '1.2.0', '1.3.0', '1.4.1', '1.5.0']) {
    const { client } = setup(undefined, version)
    const configuration = await client.configuration(31337, safe)
    const [proposal] = await client.pending(31337, safe, configuration)
    expect(proposal.integrity?.status).toBe('matched')
    expect(verifySafeHash(proposal, 31337, owners[1], version).status).toBe('mismatch')
    expect(verifySafeHash(proposal, 1, safe, version).status).toBe(
      ['1.1.1', '1.2.0'].includes(version) ? 'matched' : 'mismatch'
    )
  }
})
