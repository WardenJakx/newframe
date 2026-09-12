import { addHexPrefix } from '@ethereumjs/util'
import log from 'electron-log'
import { getAddress, isAddress } from 'ethers'

import { getProfileAccountIds } from '../../../app/contracts/state/main.js'
import type { Erc20ProviderPort, TokenData } from '../../../platform/chain-rpc/contracts/erc20.js'
import type { CanonicalStoreReader } from '../../../platform/state-store/actions.js'
import type { Token } from '../../../platform/state-store/state/index.js'
import { persistedImageSource } from '../../asset-data/domain/image/index.js'
import type { Provider } from '../../connections/main/provider/index.js'
import type { TransactionRequest } from '../../requests/contract/requests.js'
import { NATIVE_CURRENCY } from '../../tokens/domain/constants.js'
import { tokenImageSource } from '../../tokens/domain/index.js'
import type { TransactionEffect, TransactionSimulation } from '../domain/index.js'

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const APPROVAL_TOPIC = '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925'
const TRACE_TYPES = new Set([
  'CALL',
  'CALLCODE',
  'DELEGATECALL',
  'STATICCALL',
  'CREATE',
  'CREATE2',
  'SELFDESTRUCT'
])
const VALUE_TRANSFER_TYPES = new Set(['CALL', 'CREATE', 'CREATE2', 'SELFDESTRUCT'])

export interface SimulationEffectContext {
  account: string
  data: { chainId: string; to?: string }
  tokenData?: TransactionRequest['tokenData']
  recognizedActions?: TransactionRequest['recognizedActions']
}

interface TokenTransfer {
  token: string
  from: string
  to: string
  amount: bigint
}

interface TokenApproval {
  token: string
  owner: string
  spender: string
  amount: bigint
}

interface NativeCurrencyLike {
  decimals?: number
  icon?: string
  image?: { base64?: string; mimeType?: string }
  symbol?: string
}

interface TokenMetadata extends TokenData {
  address: string
  chainId: number
  logoURI?: string
}

type TransactionSimulationProviderPort = Pick<Provider, 'send'> & Erc20ProviderPort

export interface TransactionSimulationProjection {
  getNativeCurrency(chainId: number): NativeCurrencyLike
  getToken(address: string, chainId: number): Token | undefined
  getProfileAccounts?(
    originatingAccountAddress: string
  ): { profileId: string; accountAddresses: string[] } | undefined
}

export function createTransactionSimulationProjection(
  canonicalStore: Pick<CanonicalStoreReader, 'getState'>
): TransactionSimulationProjection {
  return {
    getNativeCurrency(chainId) {
      return (canonicalStore.getState().main.networksMeta.ethereum[chainId]?.nativeCurrency ||
        {}) as NativeCurrencyLike
    },
    getToken(address, chainId) {
      return canonicalStore.getState().main.tokens.byId[`${chainId}:${normalizeAddress(address)}`]
    },
    getProfileAccounts(originatingAccountAddress) {
      const main = canonicalStore.getState().main
      const normalizedOrigin = normalizeAddress(originatingAccountAddress)
      if (!normalizedOrigin) return

      const originatingAccount =
        main.accounts[originatingAccountAddress] ||
        main.accounts[normalizedOrigin] ||
        Object.values(main.accounts).find((account) => normalizeAddress(account.address) === normalizedOrigin)

      if (!originatingAccount) return

      const accountAddresses = [
        ...new Set(
          getProfileAccountIds(main, originatingAccount.profileId)
            .map((id) => normalizeAddress(main.accounts[id]?.address))
            .filter(Boolean)
        )
      ]

      return { profileId: originatingAccount.profileId, accountAddresses }
    }
  }
}

export interface TraceCall {
  type?: string
  from?: string
  to?: string
  input?: string
  data?: string
  output?: string
  value?: string | number | bigint
  error?: string
  revertReason?: string
  calls?: TraceCall[]
  logs?: Array<{
    address?: string
    topics?: string[]
    data?: string
  }>
}

export function isTraceCall(value: unknown): value is TraceCall {
  const pending: unknown[] = [value]
  const seen = new Set<object>()
  const bytes = (value: unknown) => typeof value === 'string' && /^0x(?:[0-9a-f]{2})*$/i.test(value)
  while (pending.length) {
    const item = pending.pop()
    if (!item || typeof item !== 'object' || Array.isArray(item) || seen.has(item)) return false
    seen.add(item)
    const call = item as Record<string, unknown>
    if (typeof call.type !== 'string' || !TRACE_TYPES.has(call.type.toUpperCase())) return false
    if (typeof call.from !== 'string' || !normalizeAddress(call.from)) return false
    if (call.to !== undefined && (typeof call.to !== 'string' || !normalizeAddress(call.to))) return false
    if (!call.to && !call.error && !call.revertReason) return false
    if (['input', 'data', 'output'].some((key) => call[key] !== undefined && !bytes(call[key]))) return false
    if (['error', 'revertReason'].some((key) => call[key] !== undefined && typeof call[key] !== 'string'))
      return false
    if (
      call.value !== undefined &&
      !(typeof call.value === 'bigint' && call.value >= 0n) &&
      !(typeof call.value === 'number' && Number.isSafeInteger(call.value) && call.value >= 0) &&
      !(typeof call.value === 'string' && /^(?:0x[0-9a-f]+|[0-9]+)$/i.test(call.value))
    )
      return false
    if (call.calls !== undefined) {
      if (!Array.isArray(call.calls)) return false
      for (const child of call.calls) pending.push(child)
    }
    if (call.logs !== undefined) {
      if (!Array.isArray(call.logs)) return false
      for (const event of call.logs) {
        if (!event || typeof event !== 'object' || Array.isArray(event)) return false
        if (typeof event.address !== 'string' || !normalizeAddress(event.address)) return false
        if (
          !Array.isArray(event.topics) ||
          !event.topics.every(
            (topic: unknown) => typeof topic === 'string' && /^0x[0-9a-f]{64}$/i.test(topic)
          )
        )
          return false
        if (!bytes(event.data)) return false
      }
    }
  }
  return true
}

interface NativeTransfer {
  from: string
  to: string
  amount: bigint
}

interface ParsedTrace {
  nativeTransfers: NativeTransfer[]
  tokenTransfers: TokenTransfer[]
  tokenApprovals: TokenApproval[]
}

function safeBigInt(value?: string | number | bigint | null) {
  if (value === undefined || value === null || value === '') return 0n

  try {
    return BigInt(value)
  } catch {
    return 0n
  }
}

function toHexQuantity(value: bigint) {
  return addHexPrefix(value.toString(16))
}

function abs(value: bigint) {
  return value < 0n ? -value : value
}

function normalizeAddress(address?: string) {
  if (!address || !isAddress(address)) return ''

  try {
    return getAddress(address).toLowerCase()
  } catch {
    return ''
  }
}

function topicAddress(topic?: string) {
  if (!topic || !/^0x0{24}[0-9a-f]{40}$/i.test(topic)) return ''
  return normalizeAddress(`0x${topic.slice(-40)}`)
}

function sameAddress(a?: string, b?: string) {
  const left = normalizeAddress(a)
  const right = normalizeAddress(b)
  return !!left && left === right
}

function walkTrace(trace: TraceCall | undefined, visit: (call: TraceCall) => void) {
  if (!trace || typeof trace !== 'object' || trace.error || trace.revertReason) return

  visit(trace)
  ;(trace.calls || []).forEach((call) => walkTrace(call, visit))
}

function parseTrace(trace: TraceCall): ParsedTrace {
  const nativeTransfers: NativeTransfer[] = []
  const tokenTransfers: TokenTransfer[] = []
  const tokenApprovals: TokenApproval[] = []

  walkTrace(trace, (call) => {
    const from = normalizeAddress(call.from)
    const to = normalizeAddress(call.to)
    const value = safeBigInt(call.value)
    if (VALUE_TRANSFER_TYPES.has(call.type?.toUpperCase() || '') && from && to && value > 0n)
      nativeTransfers.push({ from, to, amount: value })

    ;(call.logs || []).forEach((event) => {
      const topics = event.topics || []
      if (topics.length !== 3 || !/^0x[0-9a-f]{64}$/i.test(event.data || '')) return
      const topic = topics[0]?.toLowerCase()
      if (topic !== TRANSFER_TOPIC && topic !== APPROVAL_TOPIC) return

      const token = normalizeAddress(event.address)
      const from = topicAddress(topics[1])
      const to = topicAddress(topics[2])
      const amount = safeBigInt(event.data)

      if (!token || !from || !to) return
      if (topic === TRANSFER_TOPIC && amount > 0n) tokenTransfers.push({ token, from, to, amount })
      if (topic === APPROVAL_TOPIC) tokenApprovals.push({ token, owner: from, spender: to, amount })
    })
  })

  return {
    nativeTransfers,
    tokenTransfers,
    tokenApprovals
  }
}

function nativeDeltaFromTransfers(transfers: NativeTransfer[], account: string) {
  const accountAddress = normalizeAddress(account)
  let delta = 0n

  transfers.forEach((transfer) => {
    if (sameAddress(transfer.from, accountAddress)) delta -= transfer.amount
    if (sameAddress(transfer.to, accountAddress)) delta += transfer.amount
  })

  return delta
}

function tokenDeltasFromTransfers(transfers: TokenTransfer[], account: string) {
  const accountAddress = normalizeAddress(account)
  const deltas = new Map<string, bigint>()

  transfers.forEach((transfer) => {
    const current = deltas.get(transfer.token) || 0n
    let next = current

    if (sameAddress(transfer.from, accountAddress)) next -= transfer.amount
    if (sameAddress(transfer.to, accountAddress)) next += transfer.amount

    if (next !== current) deltas.set(transfer.token, next)
  })

  return deltas
}

function tokenFromRequest(
  req: SimulationEffectContext,
  address: string,
  chainId: number
): TokenMetadata | undefined {
  if (req.tokenData && sameAddress(req.data.to, address)) {
    return {
      ...req.tokenData,
      address,
      chainId
    }
  }

  const matchingAction = (req.recognizedActions || []).find((action: any) => {
    const contract = action?.data?.contract?.address || action?.data?.contract
    return sameAddress(contract, address)
  }) as any

  if (matchingAction?.data) {
    return {
      address,
      chainId,
      decimals: matchingAction.data.decimals,
      logoURI: matchingAction.data.logoURI,
      name: matchingAction.data.name || matchingAction.data.symbol || 'Token',
      symbol: matchingAction.data.symbol || 'Token'
    }
  }
}

async function resolveTokenMetadata(
  req: SimulationEffectContext,
  address: string,
  chainId: number,
  projection: TransactionSimulationProjection,
  provider?: Erc20ProviderPort
) {
  const cached = projection.getToken(address, chainId)
  if (cached) {
    return {
      address,
      chainId,
      decimals: cached.decimals,
      logoURI: tokenImageSource(cached),
      name: cached.name || cached.symbol || 'Token',
      symbol: cached.symbol || 'Token'
    }
  }

  const requestToken = tokenFromRequest(req, address, chainId)
  if (requestToken) return requestToken

  if (!provider) {
    return {
      address,
      chainId,
      name: 'Token',
      symbol: 'Token'
    }
  }

  try {
    const loaded = (await import('../../../platform/chain-rpc/contracts/erc20.js')).default as unknown
    const Erc20Contract = (
      loaded && typeof loaded === 'object' && 'default' in loaded ? loaded.default : loaded
    ) as typeof import('../../../platform/chain-rpc/contracts/erc20.js').default
    const tokenData = await new Erc20Contract(address, chainId, provider).getTokenData()
    return {
      ...tokenData,
      address,
      chainId,
      name: tokenData.name || tokenData.symbol || 'Token',
      symbol: tokenData.symbol || 'Token'
    }
  } catch (error) {
    log.warn('unable to resolve simulated token metadata', { address, chainId, error })
    return {
      address,
      chainId,
      name: 'Token',
      symbol: 'Token'
    }
  }
}

function nativeEffect(delta: bigint, nativeCurrency: NativeCurrencyLike): TransactionEffect | undefined {
  if (delta === 0n) return

  const direction = delta < 0n ? 'out' : 'in'

  return {
    id: 'sim-native',
    kind: 'native',
    direction,
    label: direction === 'out' ? 'Asset out' : 'Asset in',
    amount: toHexQuantity(abs(delta)),
    decimals: nativeCurrency.decimals ?? 18,
    symbol: nativeCurrency.symbol || 'ETH',
    detail: 'Simulated balance change',
    assetAddress: NATIVE_CURRENCY,
    ...(persistedImageSource(nativeCurrency.image)
      ? { logoURI: persistedImageSource(nativeCurrency.image) }
      : {})
  }
}

async function tokenEffects(
  deltas: Map<string, bigint>,
  req: SimulationEffectContext,
  chainId: number,
  projection: TransactionSimulationProjection,
  provider?: Erc20ProviderPort,
  metadataByAddress = new Map<string, Promise<TokenMetadata>>()
): Promise<TransactionEffect[]> {
  const effects = await Promise.all(
    [...deltas.entries()]
      .filter(([, delta]) => delta !== 0n)
      .map(async ([address, delta]) => {
        const metadataPromise =
          metadataByAddress.get(address) || resolveTokenMetadata(req, address, chainId, projection, provider)
        metadataByAddress.set(address, metadataPromise)
        const metadata = await metadataPromise
        const direction = delta < 0n ? 'out' : 'in'

        return {
          id: `sim-erc20-${address}`,
          kind: 'erc20',
          direction,
          label: direction === 'out' ? 'Asset out' : 'Asset in',
          amount: toHexQuantity(abs(delta)),
          symbol: metadata.symbol || 'Token',
          detail: 'Simulated balance change',
          assetAddress: address,
          ...(Number.isInteger(metadata.decimals) ? { decimals: metadata.decimals } : {}),
          ...(metadata.logoURI ? { logoURI: metadata.logoURI } : {})
        } as TransactionEffect
      })
  )

  return effects
}

async function approvalEffects(
  approvals: TokenApproval[],
  req: SimulationEffectContext,
  chainId: number,
  projection: TransactionSimulationProjection,
  provider: Erc20ProviderPort | undefined,
  metadataByAddress: Map<string, Promise<TokenMetadata>>,
  account: string
): Promise<TransactionEffect[]> {
  return Promise.all(
    approvals
      .filter((approval) => sameAddress(approval.owner, account))
      .map(async (approval, index) => {
        const metadataPromise =
          metadataByAddress.get(approval.token) ||
          resolveTokenMetadata(req, approval.token, chainId, projection, provider)
        metadataByAddress.set(approval.token, metadataPromise)
        const metadata = await metadataPromise
        return {
          id: `sim-allowance-${approval.token}-${approval.spender}-${index}`,
          kind: 'allowance',
          direction: 'neutral',
          label: 'Observed approval',
          amount: toHexQuantity(approval.amount),
          symbol: metadata.symbol,
          assetAddress: approval.token,
          spenderAddress: approval.spender,
          detail: `Approval event for spender ${approval.spender}`,
          ...(Number.isInteger(metadata.decimals) ? { decimals: metadata.decimals } : {}),
          ...(metadata.logoURI ? { logoURI: metadata.logoURI } : {})
        }
      })
  )
}

function createTraceCall(req: TransactionRequest) {
  const data = req.data || {}
  const call = {
    from: data.from || req.account,
    to: data.to,
    gas: data.gasLimit || data.gas,
    value: data.value || '0x0',
    data: data.data || '0x'
  } as Record<string, string | undefined>

  return Object.fromEntries(Object.entries(call).filter(([, value]) => value !== undefined && value !== ''))
}

async function traceCall(
  req: TransactionRequest,
  chainId: number,
  provider: TransactionSimulationProviderPort
) {
  const payload = {
    id: Date.now(),
    jsonrpc: '2.0',
    method: 'debug_traceCall',
    params: [
      createTraceCall(req),
      'latest',
      {
        tracer: 'callTracer',
        tracerConfig: {
          withLog: true
        }
      }
    ],
    chainId: addHexPrefix(chainId.toString(16)),
    _origin: 'newframe-internal'
  } as const

  return new Promise<TraceCall>((resolve, reject) => {
    Promise.resolve(
      provider.send(payload, (response) => {
        if (response?.error) return reject(response.error)
        if (!isTraceCall(response?.result)) return reject(new Error('RPC returned an invalid call trace'))
        resolve(response.result)
      })
    ).catch(reject)
  })
}

function simulationUnavailable(error: unknown): TransactionSimulation {
  const message =
    typeof error === 'string'
      ? error
      : error && typeof error === 'object' && 'message' in error
        ? String((error as { message?: unknown }).message)
        : 'Transaction simulation unavailable'

  return {
    status: 'unavailable',
    source: 'debug_traceCall',
    error: message,
    updatedAt: Date.now()
  }
}

export async function effectsFromTrace(
  trace: TraceCall,
  req: SimulationEffectContext,
  nativeCurrency: NativeCurrencyLike,
  projection: TransactionSimulationProjection,
  provider?: Erc20ProviderPort
): Promise<TransactionEffect[]> {
  return effectsFromParsedTrace(parseTrace(trace), req, nativeCurrency, projection, provider)
}

async function effectsFromParsedTrace(
  trace: ParsedTrace,
  req: SimulationEffectContext,
  nativeCurrency: NativeCurrencyLike,
  projection: TransactionSimulationProjection,
  provider?: Erc20ProviderPort,
  metadataByAddress = new Map<string, Promise<TokenMetadata>>(),
  account = req.account
): Promise<TransactionEffect[]> {
  const chainId = parseInt(req.data.chainId, 16)
  const nativeDelta = nativeDeltaFromTransfers(trace.nativeTransfers, account)
  const tokenDeltas = tokenDeltasFromTransfers(trace.tokenTransfers, account)
  const effects = [
    nativeEffect(nativeDelta, nativeCurrency),
    ...(await tokenEffects(tokenDeltas, req, chainId, projection, provider, metadataByAddress)),
    ...(await approvalEffects(
      trace.tokenApprovals,
      req,
      chainId,
      projection,
      provider,
      metadataByAddress,
      account
    ))
  ].filter(Boolean) as TransactionEffect[]

  return effects
}

export async function simulateTransactionEffects(
  req: TransactionRequest,
  provider: TransactionSimulationProviderPort,
  projection: TransactionSimulationProjection
): Promise<TransactionSimulation> {
  const chainId = parseInt(req.data.chainId, 16)
  const nativeCurrency = projection.getNativeCurrency(chainId)

  if (!req.data.to) {
    return {
      status: 'unavailable',
      source: 'debug_traceCall',
      error: 'Contract deployment simulation is not supported yet',
      updatedAt: Date.now()
    }
  }

  let trace: TraceCall

  try {
    trace = await traceCall(req, chainId, provider)
  } catch (error) {
    log.warn('transaction simulation unavailable', { handlerId: req.handlerId, error })
    return simulationUnavailable(error)
  }

  if (trace?.error || trace?.revertReason) {
    return {
      status: 'error',
      source: 'debug_traceCall',
      error: trace.error || trace.revertReason,
      updatedAt: Date.now()
    }
  }

  try {
    const parsedTrace = parseTrace(trace)
    const metadataByAddress = new Map<string, Promise<TokenMetadata>>()
    const effects = await effectsFromParsedTrace(
      parsedTrace,
      req,
      nativeCurrency,
      projection,
      provider,
      metadataByAddress
    )
    const profile = projection.getProfileAccounts?.(req.account)
    const effectsByAccount = profile
      ? Object.fromEntries(
          (
            await Promise.all(
              profile.accountAddresses.map(async (accountAddress): Promise<[string, TransactionEffect[]]> => [
                accountAddress,
                await effectsFromParsedTrace(
                  parsedTrace,
                  req,
                  nativeCurrency,
                  projection,
                  provider,
                  metadataByAddress,
                  accountAddress
                )
              ])
            )
          ).filter(([, accountEffects]) => accountEffects.length)
        )
      : undefined

    return {
      status: 'success',
      source: 'debug_traceCall',
      effects,
      ...(profile ? { effectsByAccount, effectsProfileId: profile.profileId } : {}),
      updatedAt: Date.now()
    }
  } catch (error) {
    log.warn('transaction simulation failed', { handlerId: req.handlerId, error })
    return {
      status: 'error',
      source: 'debug_traceCall',
      error: error instanceof Error ? error.message : 'Transaction simulation failed',
      updatedAt: Date.now()
    }
  }
}
