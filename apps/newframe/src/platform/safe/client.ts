import { Interface } from 'ethers'
import { z } from 'zod'

import {
  safeAddressSchema,
  safeConfigurationSchema,
  safeDecodedSchema,
  safeProposalSchema,
  type SafeConfiguration,
  type SafeProposal
} from '../../features/accounts/domain/safe.js'
import { decodeCallDataWithSignature, type DecodedCallData } from '../chain-rpc/contracts/index.js'
import { getLocalFunctionSelectorSignatures } from '../chain-rpc/contracts/selectors.js'
import { multicallAddress, type Call } from '../chain-rpc/multicall/constants.js'
import { aggregate3 } from '../chain-rpc/multicall/index.js'
import { verifySafeHash, serviceCalldataMismatch } from './integrity.js'

const SAFE_TRANSACTION_SERVICE_URL = 'https://api.safe.global/tx-service'
// Hosted Transaction Service resolver from @safe-global/api-kit@5.0.3, synced 2026-09-09.
// Codex (81224) was added from the current upstream resolver after that release.
const SAFE_SERVICE_NETWORK_SHORT_NAMES = Object.freeze({
  1: 'eth',
  10: 'oeth',
  50: 'xdc',
  56: 'bnb',
  100: 'gno',
  130: 'unichain',
  137: 'pol',
  143: 'monad',
  146: 'sonic',
  196: 'okb',
  204: 'opbnb',
  232: 'lens',
  324: 'zksync',
  480: 'wc',
  677: 'bot',
  988: 'stable',
  999: 'hyper',
  1001: 'kairos',
  1672: 'pharos',
  1874: 'wch-sepolia',
  3338: 'peaq',
  4217: 'tempo',
  4326: 'mega',
  4663: 'robinhood',
  5000: 'mantle',
  5003: 'mnt-sep',
  5042: 'arc',
  8217: 'kaia',
  8453: 'base',
  9745: 'plasma',
  10143: 'monad-testnet',
  10200: 'chi',
  16661: '0g',
  25363: 'fluent',
  42161: 'arb1',
  42220: 'celo',
  42431: 'tempo-moderato',
  43111: 'hemi',
  43114: 'avax',
  46630: 'robinhood-testnet',
  57073: 'ink',
  59144: 'linea',
  80069: 'bep',
  80094: 'berachain',
  81224: 'codex',
  84532: 'basesep',
  102030: 'ctc',
  534352: 'scr',
  747474: 'katana',
  5042002: 'arc-testnet',
  11142220: 'celo-sep',
  11155111: 'sep',
  1313161554: 'aurora'
} satisfies Readonly<Record<number, string>>)
const SAFE_SERVICE_NETWORKS: Readonly<Record<string, string>> = Object.freeze(
  Object.fromEntries(
    Object.entries(SAFE_SERVICE_NETWORK_SHORT_NAMES).map(([chainId, shortName]) => [
      chainId,
      `${SAFE_TRANSACTION_SERVICE_URL}/${shortName}/api`
    ])
  )
)
export function safeServiceNetworks(options: {
  development: boolean
  url?: string
  chainId?: string
}): Readonly<Record<string, string>> {
  if (!options.development || !options.url || !options.chainId) {
    return SAFE_SERVICE_NETWORKS
  }
  const chainId = Number(options.chainId)
  if (!Number.isSafeInteger(chainId) || chainId <= 0) {
    throw new Error('Invalid development Safe chain ID')
  }
  const url = new URL(options.url)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('Invalid development Safe URL')
  }
  return { ...SAFE_SERVICE_NETWORKS, [chainId]: url.href.replace(/\/$/, '') }
}
export type SafeRequest = (url: string, init: RequestInit) => Promise<Response>
const decimalInput = z
  .union([z.string(), z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER)])
  .transform(String)
const infoSchema = z.object({
  address: safeAddressSchema,
  owners: z.array(safeAddressSchema),
  threshold: z.number(),
  nonce: decimalInput,
  version: z.string().optional()
})
const proposalInput = z.object({
  safeTxHash: z.string(),
  safe: z.string(),
  nonce: decimalInput,
  to: z.string(),
  value: z.string(),
  operation: z.number(),
  data: z.string().nullable(),
  confirmations: z.array(z.object({ owner: z.string() })),
  safeTxGas: decimalInput.optional(),
  baseGas: decimalInput.optional(),
  gasPrice: decimalInput.optional(),
  gasToken: z.string().optional(),
  refundReceiver: z.string().optional(),
  dataDecoded: z.unknown().optional(),
  isExecuted: z.boolean()
})
const pageSchema = z.object({ next: z.string().nullable(), results: z.array(proposalInput) })
const confirmationPageSchema = z.object({
  next: z.string().nullable(),
  results: z.array(z.unknown()).max(1000)
})
const confirmationSchema = z.object({
  owner: safeAddressSchema,
  signature: z.string().regex(/^0x[0-9a-f]{130}$/i)
})
const transactionHashSchema = z.string().regex(/^0x[0-9a-f]{64}$/i)

export function createSafeClient({
  request,
  networks = SAFE_SERVICE_NETWORKS,
  timeoutMs = 15000,
  decode,
  call,
  now = Date.now
}: {
  request: SafeRequest
  networks?: Readonly<Record<string, string>>
  timeoutMs?: number
  decode?: (address: string, chainId: number, data: string) => Promise<DecodedCallData | undefined>
  call?: (
    chainId: number,
    address: string,
    data: string,
    blockTag?: string,
    signal?: AbortSignal
  ) => Promise<string>
  now?: () => number
}) {
  const cooldowns = new Map<string, number>()
  function base(chainId: number) {
    const url = networks[chainId]
    if (!Number.isSafeInteger(chainId) || !url) {
      throw new Error('Safe queue service is unavailable on this network')
    }
    return url.replace(/\/$/, '')
  }
  async function json(url: string, signal?: AbortSignal, signature?: string): Promise<unknown> {
    const origin = new URL(url).origin
    const remaining = (cooldowns.get(origin) ?? 0) - now()
    if (remaining > 0) {
      throw new Error(`Safe service rate limited; retry in ${Math.ceil(remaining / 1000)} seconds`)
    }
    const controller = new AbortController()
    const abort = () => controller.abort(signal?.reason)
    if (signal?.aborted) {
      abort()
    } else {
      signal?.addEventListener('abort', abort, { once: true })
    }
    const timer = setTimeout(() => controller.abort(new Error('Safe service request timed out')), timeoutMs)
    try {
      controller.signal.throwIfAborted()
      const response = await request(url, {
        method: signature === undefined ? 'GET' : 'POST',
        signal: controller.signal,
        redirect: 'error',
        headers: {
          Accept: 'application/json',
          ...(signature === undefined ? {} : { 'Content-Type': 'application/json' })
        },
        ...(signature === undefined ? {} : { body: JSON.stringify({ signature }) })
      })
      if (response.status === 429) {
        const retry = response.headers.get('retry-after')
        const seconds =
          retry && /^\d+(\.\d+)?$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry ?? '') - now()
        cooldowns.set(origin, now() + (Number.isFinite(seconds) && seconds > 0 ? seconds : 60000))
        throw new Error('Safe service rate limited')
      }
      if (!response.ok) {
        throw new Error(`Safe service HTTP ${response.status}`)
      }
      // Confirmation responses are acknowledgements, not evidence of stored signature bytes.
      const result: unknown = signature === undefined ? await response.json() : await response.text()
      controller.signal.throwIfAborted()
      return result
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
    }
  }
  const signatures = {
    VERSION: 'function VERSION() view returns (string)',
    getOwners: 'function getOwners() view returns (address[])',
    getThreshold: 'function getThreshold() view returns (uint256)',
    nonce: 'function nonce() view returns (uint256)'
  }
  const abi = new Interface(Object.values(signatures))
  const identitySchema = z.object({
    version: z.string().min(1).max(100),
    owners: z.array(safeAddressSchema).min(1).max(1000)
  })
  async function read(
    chainId: number,
    address: string,
    data: string,
    signal?: AbortSignal,
    blockTag?: string
  ): Promise<string> {
    if (!call) {
      throw new Error('Safe chain provider is unavailable')
    }
    signal?.throwIfAborted()
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const result = await Promise.race([
        call(chainId, address, data, blockTag, signal),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Safe chain request timed out')), timeoutMs)
        })
      ])
      signal?.throwIfAborted()
      return result
    } finally {
      clearTimeout(timer)
    }
  }
  async function readBatch(
    chainId: number,
    address: string,
    methods: (keyof typeof signatures)[],
    signal?: AbortSignal,
    blockTag?: string
  ): Promise<unknown[]> {
    const calls: Call<unknown, unknown>[] = methods.map((method) => ({
      target: address,
      call: [signatures[method]],
      returns: [(value) => value]
    }))
    const unavailable = new Error('Multicall3 is unavailable')
    try {
      const results = await aggregate3(calls, async (data) => {
        const response = await read(chainId, multicallAddress, data, signal, blockTag)
        if (response === '0x') {
          throw unavailable
        }
        return response
      })
      return results.map(({ success, returnValues }, index) => {
        if (!success || returnValues[0] == null) {
          throw new Error(`Safe ${methods[index]} call failed`)
        }
        return returnValues[0]
      })
    } catch (error) {
      if (error !== unavailable) {
        throw error
      }
      return Promise.all(
        methods.map(async (method) => {
          const data = abi.encodeFunctionData(method)
          const response = await read(chainId, address, data, signal, blockTag)
          return abi.decodeFunctionResult(method, response)[0]
        })
      )
    }
  }
  async function discover(chainId: number, address: string, signal?: AbortSignal, blockTag?: string) {
    const expected = safeAddressSchema.parse(address)
    const [version, owners] = await readBatch(chainId, expected, ['VERSION', 'getOwners'], signal, blockTag)
    return identitySchema.parse({ version, owners })
  }
  async function serviceConfiguration(chainId: number, expected: string, signal?: AbortSignal) {
    const info = infoSchema.parse(await json(`${base(chainId)}/v1/safes/${expected}/`, signal))
    if (info.address !== expected) {
      throw new Error('Safe service returned a different Safe')
    }
    return safeConfigurationSchema.parse({
      owners: info.owners,
      threshold: info.threshold,
      nonce: info.nonce,
      ...(info.version === undefined ? {} : { version: info.version })
    })
  }
  return {
    discover,
    async confirmations(
      chainId: number,
      hash: string,
      signal?: AbortSignal
    ): Promise<{ owner: string; signature: string }[]> {
      const first = new URL(
        `${base(chainId)}/v1/multisig-transactions/${transactionHashSchema.parse(hash)}/confirmations/`
      )
      let next: URL | undefined = first
      const visited = new Set<string>()
      const confirmations = new Map<string, { owner: string; signature: string }>()
      for (let pages = 0; next; pages++) {
        if (pages >= 100 || visited.has(next.href)) {
          throw new Error('Safe pagination did not progress')
        }
        visited.add(next.href)
        const page = confirmationPageSchema.parse(await json(next.href, signal))
        for (const raw of page.results) {
          const confirmation = confirmationSchema.safeParse(raw)
          // Other owners may have contract or on-chain confirmations we cannot verify.
          if (confirmation.success) {
            const item = confirmation.data
            confirmations.set(`${item.owner}:${item.signature}`, item)
          }
        }
        if (!page.next) {
          break
        }
        if (!page.results.length) {
          throw new Error('Safe pagination did not progress')
        }
        const candidate: URL = new URL(page.next, next)
        if (
          candidate.origin !== first.origin ||
          candidate.pathname !== first.pathname ||
          candidate.username ||
          candidate.password ||
          candidate.hash
        ) {
          throw new Error('Unsafe Safe pagination URL')
        }
        next = candidate
      }
      return [...confirmations.values()]
    },
    async confirm(chainId: number, hash: string, signature: string, signal?: AbortSignal): Promise<void> {
      transactionHashSchema.parse(hash)
      confirmationSchema.shape.signature.parse(signature)
      await json(`${base(chainId)}/v1/multisig-transactions/${hash}/confirmations/`, signal, signature)
    },
    async queueState(
      chainId: number,
      address: string,
      signal?: AbortSignal
    ): Promise<Pick<SafeConfiguration, 'nonce'> | SafeConfiguration> {
      const expected = safeAddressSchema.parse(address)
      if (!call) {
        return serviceConfiguration(chainId, expected, signal)
      }
      const [nonce] = await readBatch(chainId, expected, ['nonce'], signal)
      return { nonce: safeConfigurationSchema.shape.nonce.parse(String(nonce)) }
    },
    async configuration(
      chainId: number,
      address: string,
      signal?: AbortSignal,
      blockTag?: string
    ): Promise<SafeConfiguration> {
      const expected = safeAddressSchema.parse(address)
      if (call) {
        const [version, owners, threshold, nonce] = await readBatch(
          chainId,
          expected,
          ['VERSION', 'getOwners', 'getThreshold', 'nonce'],
          signal,
          blockTag
        )
        return safeConfigurationSchema.parse({
          ...identitySchema.parse({ version, owners }),
          threshold: Number(threshold),
          nonce: String(nonce)
        })
      }
      return serviceConfiguration(chainId, expected, signal)
    },
    async pending(
      chainId: number,
      address: string,
      configuration: SafeConfiguration,
      signal?: AbortSignal
    ): Promise<SafeProposal[]> {
      const expected = safeAddressSchema.parse(address)
      const config = safeConfigurationSchema.parse(configuration)
      const first = new URL(
        `${base(chainId)}/v2/safes/${expected}/multisig-transactions/?executed=false&nonce__gte=${config.nonce}`
      )
      let next: URL | undefined = first
      const visited = new Set<string>()
      const proposals = new Map<string, SafeProposal>()
      for (let pages = 0; next; pages++) {
        if (pages >= 1000 || visited.has(next.href)) {
          throw new Error('Safe pagination did not progress')
        }
        visited.add(next.href)
        const page = pageSchema.parse(await json(next.href, signal))
        const before = proposals.size
        for (const raw of page.results) {
          const proposal = safeProposalSchema.parse({
            safeTxHash: raw.safeTxHash,
            safe: raw.safe,
            nonce: raw.nonce,
            to: raw.to,
            value: raw.value,
            operation: raw.operation,
            data: raw.data ?? '0x',
            safeTxGas: raw.safeTxGas,
            baseGas: raw.baseGas,
            gasPrice: raw.gasPrice,
            gasToken: raw.gasToken,
            refundReceiver: raw.refundReceiver,
            confirmations: [
              ...new Set(raw.confirmations.map((confirmation) => safeAddressSchema.parse(confirmation.owner)))
            ],
            dataDecoded: safeDecodedSchema.safeParse(raw.dataDecoded).data
          })
          if (proposal.safe !== expected) {
            throw new Error('Safe proposal identity mismatch')
          }
          if (raw.isExecuted || BigInt(proposal.nonce) < BigInt(config.nonce)) {
            continue
          }
          proposal.integrity = verifySafeHash(proposal, chainId, expected, config.version)
          if (serviceCalldataMismatch(proposal)) {
            proposal.integrity = {
              ...proposal.integrity,
              status: 'mismatch',
              reason: 'Integrity mismatch: the service description does not match the calldata.'
            }
          }
          if (proposal.data !== '0x') {
            const local = getLocalFunctionSelectorSignatures(proposal.data.slice(0, 10))
              .map((signature) => decodeCallDataWithSignature(proposal.data, signature))
              .find(Boolean)
            let timer: ReturnType<typeof setTimeout> | undefined
            try {
              const decoded = local
                ? { ...local, source: 'Local function selector' }
                : decode
                  ? await Promise.race([
                      decode(proposal.to, chainId, proposal.data),
                      new Promise<undefined>((resolve) => {
                        timer = setTimeout(() => resolve(undefined), 5000)
                      })
                    ])
                  : undefined
              if (decoded) {
                proposal.localDecoded = safeDecodedSchema.extend({ source: z.string().max(200) }).safeParse({
                  method: decoded.method,
                  parameters: decoded.args,
                  source: decoded.source
                }).data
              }
            } catch {
              /* Raw calldata remains available when ABI lookup fails. */
            } finally {
              clearTimeout(timer)
            }
          }
          signal?.throwIfAborted()
          proposals.set(proposal.safeTxHash, proposal)
        }
        if (page.next && proposals.size === before) {
          throw new Error('Safe pagination did not progress')
        }
        if (!page.next) {
          break
        }
        const candidate: URL = new URL(page.next, next)
        if (
          candidate.origin !== first.origin ||
          candidate.pathname !== first.pathname ||
          candidate.username ||
          candidate.password ||
          candidate.hash ||
          candidate.searchParams.get('executed') !== 'false' ||
          candidate.searchParams.get('nonce__gte') !== config.nonce
        ) {
          throw new Error('Unsafe Safe pagination URL')
        }
        next = candidate
      }
      return [...proposals.values()]
    }
  }
}
