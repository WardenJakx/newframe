import { verifySafeHash, serviceCalldataMismatch } from './integrity.js'
import { decodeCallDataWithSignature, type DecodedCallData } from '../chain-rpc/contracts/index.js'
import { getLocalFunctionSelectorSignatures } from '../chain-rpc/contracts/selectors.js'
import { z } from 'zod'
import {
  safeAddressSchema,
  safeConfigurationSchema,
  safeDecodedSchema,
  safeProposalSchema,
  type SafeConfiguration,
  type SafeProposal
} from '../../features/accounts/domain/safe.js'

const SAFE_SERVICE_NETWORKS: Readonly<Record<string, string>> = Object.freeze({
  1: 'https://api.safe.global/tx-service/eth/api',
  100: 'https://api.safe.global/tx-service/gno/api',
  11155111: 'https://api.safe.global/tx-service/sep/api'
})
export function safeServiceNetworks(options: {
  development: boolean
  url?: string
  chainId?: string
}): Readonly<Record<string, string>> {
  if (!options.development || !options.url || !options.chainId) return SAFE_SERVICE_NETWORKS
  const chainId = Number(options.chainId)
  if (!Number.isSafeInteger(chainId) || chainId <= 0) throw new Error('Invalid development Safe chain ID')
  const url = new URL(options.url)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
    throw new Error('Invalid development Safe URL')
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

export function createSafeClient({
  request,
  networks = SAFE_SERVICE_NETWORKS,
  timeoutMs = 15000,
  decode,
  now = Date.now
}: {
  request: SafeRequest
  networks?: Readonly<Record<string, string>>
  timeoutMs?: number
  decode?: (address: string, chainId: number, data: string) => Promise<DecodedCallData | undefined>
  now?: () => number
}) {
  const cooldowns = new Map<string, number>()
  function base(chainId: number) {
    const url = networks[chainId]
    if (!Number.isSafeInteger(chainId) || !url) throw new Error('Unsupported Safe network')
    return url.replace(/\/$/, '')
  }
  async function json(url: string, signal?: AbortSignal): Promise<unknown> {
    const origin = new URL(url).origin
    const remaining = (cooldowns.get(origin) ?? 0) - now()
    if (remaining > 0)
      throw new Error(`Safe service rate limited; retry in ${Math.ceil(remaining / 1000)} seconds`)
    const controller = new AbortController()
    const abort = () => controller.abort(signal?.reason)
    if (signal?.aborted) abort()
    else signal?.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(() => controller.abort(new Error('Safe service request timed out')), timeoutMs)
    try {
      controller.signal.throwIfAborted()
      const response = await request(url, {
        method: 'GET',
        signal: controller.signal,
        redirect: 'error',
        headers: { Accept: 'application/json' }
      })
      if (response.status === 429) {
        const retry = response.headers.get('retry-after')
        const seconds =
          retry && /^\d+(\.\d+)?$/.test(retry) ? Number(retry) * 1000 : Date.parse(retry ?? '') - now()
        cooldowns.set(origin, now() + (Number.isFinite(seconds) && seconds > 0 ? seconds : 60000))
        throw new Error('Safe service rate limited')
      }
      if (!response.ok) throw new Error(`Safe service HTTP ${response.status}`)
      const result: unknown = await response.json()
      controller.signal.throwIfAborted()
      return result
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
    }
  }
  return {
    supportedNetworks: () => Object.keys(networks).map(Number),
    async configuration(chainId: number, address: string, signal?: AbortSignal): Promise<SafeConfiguration> {
      const expected = safeAddressSchema.parse(address)
      const info = infoSchema.parse(await json(`${base(chainId)}/v1/safes/${expected}/`, signal))
      if (info.address !== expected) throw new Error('Safe service returned a different Safe')
      return safeConfigurationSchema.parse({
        owners: info.owners,
        threshold: info.threshold,
        nonce: info.nonce,
        ...(info.version === undefined ? {} : { version: info.version })
      })
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
        if (pages >= 1000 || visited.has(next.href)) throw new Error('Safe pagination did not progress')
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
          if (proposal.safe !== expected) throw new Error('Safe proposal identity mismatch')
          if (raw.isExecuted || BigInt(proposal.nonce) < BigInt(config.nonce)) continue
          proposal.integrity = verifySafeHash(proposal, chainId, expected, config.version)
          if (serviceCalldataMismatch(proposal))
            proposal.integrity = {
              ...proposal.integrity,
              status: 'mismatch',
              reason: 'Integrity mismatch: the service description does not match the calldata.'
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
              if (decoded)
                proposal.localDecoded = safeDecodedSchema.extend({ source: z.string().max(200) }).safeParse({
                  method: decoded.method,
                  parameters: decoded.args,
                  source: decoded.source
                }).data
            } catch {
              /* Raw calldata remains available when ABI lookup fails. */
            } finally {
              clearTimeout(timer)
            }
          }
          signal?.throwIfAborted()
          proposals.set(proposal.safeTxHash, proposal)
        }
        if (page.next && proposals.size === before) throw new Error('Safe pagination did not progress')
        if (!page.next) break
        const candidate: URL = new URL(page.next, next)
        if (
          candidate.origin !== first.origin ||
          candidate.pathname !== first.pathname ||
          candidate.username ||
          candidate.password ||
          candidate.hash ||
          candidate.searchParams.get('executed') !== 'false' ||
          candidate.searchParams.get('nonce__gte') !== config.nonce
        )
          throw new Error('Unsafe Safe pagination URL')
        next = candidate
      }
      return [...proposals.values()]
    }
  }
}
