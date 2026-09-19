import { afterEach, describe, expect, test } from 'bun:test'

import { getBytes, Wallet } from 'ethers'

import { createSafeHandler } from '../../../scripts/local-safe/handler.js'
import { abi as multicallAbi, multicallAddress } from '../chain-rpc/multicall/constants.js'
import { createSafeClient, safeServiceNetworks } from './client.js'
import { verifySafeHash } from './integrity.js'

const safe = '0x1111111111111111111111111111111111111111'
const owners = ['0x2222222222222222222222222222222222222222', '0x3333333333333333333333333333333333333333']
const servers: ReturnType<typeof Bun.serve>[] = []
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.stop(true)))
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
      expect(client.configuration(31337, safe)).rejects.toThrow()
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
        if (!request.url.includes('/v2/')) {
          return response
        }
        const page = await response.json()
        page.results[0] = { ...page.results[0], ...replacement }
        return Response.json(page)
      })
      const configuration = await client.configuration(31337, safe)
      expect(client.pending(31337, safe, configuration)).rejects.toThrow()
    }
  })
  test('deduplicates hashes without dropping alternative proposals', async () => {
    const { client } = setup(async (request, response) => {
      if (!request.url.includes('/v2/')) {
        return response
      }
      const page = (await response.json()) as { results: unknown[] }
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
    expect(client.pending(31337, safe, configuration)).rejects.toThrow('HTTP 503')
  })
  test('rejects foreign and repeated pagination links', async () => {
    for (const foreign of [true, false]) {
      const { client } = setup(async (request, response) => {
        if (!request.url.includes('/v2/')) {
          return response
        }
        return Response.json({
          ...(await response.json()),
          next: foreign ? 'https://example.org/api/' : request.url
        })
      })
      const configuration = await client.configuration(31337, safe)
      expect(client.pending(31337, safe, configuration)).rejects.toThrow(foreign ? 'Unsafe' : 'progress')
    }
  })
  test('enforces Retry-After without sending another request', async () => {
    const { client, handler } = setup()
    handler.failNext(429, '30')
    expect(client.configuration(31337, safe)).rejects.toThrow('rate limited')
    expect(client.configuration(31337, safe)).rejects.toThrow('rate limited')
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
    expect(client.configuration(31337, safe)).rejects.toThrow()
    const abort = new AbortController()
    abort.abort()
    expect(client.configuration(31337, safe, abort.signal)).rejects.toThrow()
  })
  test('resolves hosted services across the supported Safe networks', () => {
    const networks = safeServiceNetworks({ development: false })
    expect(Object.keys(networks)).toHaveLength(53)
    expect(networks[10]).toBe('https://api.safe.global/tx-service/oeth/api')
    expect(networks[56]).toBe('https://api.safe.global/tx-service/bnb/api')
    expect(networks[137]).toBe('https://api.safe.global/tx-service/pol/api')
    expect(networks[143]).toBe('https://api.safe.global/tx-service/monad/api')
    expect(networks[999]).toBe('https://api.safe.global/tx-service/hyper/api')
    expect(networks[8453]).toBe('https://api.safe.global/tx-service/base/api')
    expect(networks[9745]).toBe('https://api.safe.global/tx-service/plasma/api')
    expect(networks[42161]).toBe('https://api.safe.global/tx-service/arb1/api')
    expect(networks[81224]).toBe('https://api.safe.global/tx-service/codex/api')
  })
  test('rejects an unsupported hosted chain before sending a request', async () => {
    let requests = 0
    const client = createSafeClient({
      request: async () => {
        requests += 1
        return Response.json({})
      }
    })
    expect(
      client.pending(999_999, safe, {
        owners,
        threshold: 2,
        nonce: '0',
        version: '1.4.1'
      })
    ).rejects.toThrow('Safe queue service is unavailable on this network')
    expect(requests).toBe(0)
  })
  test('production ignores development overrides', () => {
    expect(
      safeServiceNetworks({ development: false, url: 'http://localhost:1234/api', chainId: '31337' })[31337]
    ).toBeUndefined()
  })
  test('development override replaces one hosted service without dropping the others', () => {
    const networks = safeServiceNetworks({
      development: true,
      url: 'http://localhost:1234/api/',
      chainId: '8453'
    })
    expect(networks[8453]).toBe('http://localhost:1234/api')
    expect(networks[1]).toBe('https://api.safe.global/tx-service/eth/api')
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
      if (!request.url.includes('/v2/')) {
        return response
      }
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
    if (!request.url.includes('/v2/')) {
      return response
    }
    const page = await response.json()
    if (!new URL(request.url).searchParams.has('offset')) {
      delete page.results[0].baseGas
    } else {
      page.results[0].dataDecoded.parameters[1].value = '2'
    }
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

test('discovers contracts through the requested chain and imports configuration without a queue service', async () => {
  const { Interface } = await import('ethers')
  const abi = new Interface([
    'function VERSION() view returns (string)',
    'function getOwners() view returns (address[])',
    'function getThreshold() view returns (uint256)',
    'function nonce() view returns (uint256)'
  ])
  const multicall = new Interface(multicallAbi)
  const calls: string[] = []
  const client = createSafeClient({
    request: async () => {
      throw new Error('Discovery must not use HTTP')
    },
    networks: {},
    call: async (chainId, address, data) => {
      expect(chainId).toBe(8453)
      expect(address).toBe(multicallAddress)
      const [batch] = multicall.decodeFunctionData('aggregate3', data)
      return multicall.encodeFunctionResult('aggregate3', [
        Array.from(batch, (entry: { target: string; callData: string }) => {
          expect(entry.target).toBe(safe)
          const method = abi.getFunction(entry.callData.slice(0, 10))!.name
          calls.push(method)
          let result: bigint | string | string[] = 9n
          if (method === 'VERSION') {
            result = '1.4.1'
          } else if (method === 'getOwners') {
            result = owners
          } else if (method === 'getThreshold') {
            result = 2n
          }
          return {
            success: true,
            returnData: abi.encodeFunctionResult(method, [result])
          }
        })
      ])
    }
  })
  expect(await client.discover(8453, safe)).toEqual({ version: '1.4.1', owners })
  expect(calls).toEqual(['VERSION', 'getOwners'])
  expect(await client.configuration(8453, safe)).toEqual({
    version: '1.4.1',
    owners,
    threshold: 2,
    nonce: '9'
  })
  calls.length = 0
  expect(await client.queueState(8453, safe)).toEqual({ nonce: '9' })
  expect(calls).toEqual(['nonce'])
})

test('rejects empty contract responses and bounds unresponsive chain probes', async () => {
  const client = createSafeClient({ request: fetch, call: async () => '0x' })
  expect(client.discover(1, safe)).rejects.toThrow()
  const hanging = createSafeClient({ request: fetch, timeoutMs: 5, call: () => new Promise(() => {}) })
  expect(hanging.discover(1, safe)).rejects.toThrow('Safe chain request timed out')
})

test('publishes real owner signatures over HTTP and retrieves the retained bytes across pages', async () => {
  const signers = [new Wallet(`0x${'12'.repeat(32)}`), new Wallet(`0x${'34'.repeat(32)}`)]
  const handler = createSafeHandler({
    chainId: 31337,
    safe,
    owners: signers.map((wallet) => wallet.address),
    threshold: 2,
    pageSize: 1
  })
  const server = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: handler.fetch })
  servers.push(server)
  const client = createSafeClient({ request: fetch, networks: { 31337: `${server.url}api` } })
  const configuration = await client.configuration(31337, safe)
  const [proposal, other] = await client.pending(31337, safe, configuration)
  const signature = signers[0].signingKey.sign(proposal.safeTxHash).serialized
  expect(await client.confirmations(31337, proposal.safeTxHash)).toEqual([])
  await client.confirm(31337, proposal.safeTxHash, signature)
  await client.confirm(31337, proposal.safeTxHash, signature)
  const personal = await signers[0].signMessage(getBytes(proposal.safeTxHash))
  const alternative = `${personal.slice(0, -2)}${(Number.parseInt(personal.slice(-2), 16) + 4).toString(16)}`
  await client.confirm(31337, proposal.safeTxHash, alternative)
  await client.confirm(31337, proposal.safeTxHash, signers[1].signingKey.sign(proposal.safeTxHash).serialized)
  expect(await client.confirmations(31337, proposal.safeTxHash)).toEqual([
    { owner: signers[0].address, signature },
    { owner: signers[1].address, signature: signers[1].signingKey.sign(proposal.safeTxHash).serialized }
  ])
  expect(client.confirm(31337, other.safeTxHash, signature)).rejects.toThrow('HTTP 400')
  expect(client.confirm(31337, `0x${'00'.repeat(32)}`, signature)).rejects.toThrow('HTTP 404')
  expect(
    client.confirm(
      31337,
      proposal.safeTxHash,
      new Wallet(`0x${'56'.repeat(32)}`).signingKey.sign(proposal.safeTxHash).serialized
    )
  ).rejects.toThrow('HTTP 400')
  expect((await client.pending(31337, safe, configuration))[0].confirmations).toHaveLength(2)
})

test('confirmation pagination isolates malformed entries and rejects unsafe or repeating links', async () => {
  const hash = `0x${'11'.repeat(32)}`
  const signature = `0x${'11'.repeat(64)}1b`
  let next: string | null = null
  const client = createSafeClient({
    networks: { 1: 'https://safe.example/api' },
    request: async () =>
      Response.json({
        next,
        results: [{ owner: owners[0], signature }, { owner: owners[1], signature: null }, null]
      })
  })
  expect(await client.confirmations(1, hash)).toEqual([{ owner: owners[0], signature }])
  for (const unsafe of [
    'https://elsewhere.example/',
    '/api/v1/another/',
    `https://user:pass@safe.example/api/v1/multisig-transactions/${hash}/confirmations/`,
    `?offset=1#fragment`
  ]) {
    next = unsafe
    expect(client.confirmations(1, hash)).rejects.toThrow('Unsafe')
  }
  next = '?offset=1'
  expect(client.confirmations(1, hash)).rejects.toThrow('progress')
})

test('confirmation POST shares HTTP errors, cooldown, cancellation, redirect and body timeout handling', async () => {
  const hash = `0x${'11'.repeat(32)}`
  const signature = `0x${'11'.repeat(64)}1b`
  let count = 0
  const client = createSafeClient({
    request: async (_url, init) => {
      count++
      expect(init.method).toBe('POST')
      expect(init.redirect).toBe('error')
      expect(JSON.parse(String(init.body))).toEqual({ signature })
      return Response.json({}, { status: 429, headers: { 'Retry-After': '30' } })
    }
  })
  expect(client.confirm(1, hash, signature)).rejects.toThrow('rate limited')
  expect(client.confirmations(1, hash)).rejects.toThrow('rate limited')
  expect(count).toBe(1)
  for (const status of [401, 403, 422, 500]) {
    const failing = createSafeClient({ request: async () => Response.json({}, { status }) })
    expect(failing.confirm(1, hash, signature)).rejects.toThrow(`HTTP ${status}`)
  }
  const aborted = new AbortController()
  aborted.abort()
  const unused = createSafeClient({
    request: async () => {
      throw new Error('Must not send')
    }
  })
  expect(unused.confirm(1, hash, signature, aborted.signal)).rejects.toThrow()
  const { client: delayed } = setup(
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            setTimeout(() => {
              try {
                controller.close()
              } catch {
                // Timeout may already have closed the response stream.
              }
            }, 300)
          }
        })
      )
  )
  expect(delayed.confirm(31337, hash, signature)).rejects.toThrow()
})
