import log from 'electron-log'
import { addHexPrefix } from '@ethereumjs/util'
import { getAddress, isAddress, TransactionDescription } from 'ethers'

import { NATIVE_CURRENCY } from '../../domain/token/constants.js'
import { erc20Interface } from '../../domain/evm.js'
import { persistedImageSource } from '../../domain/image/index.js'
import { tokenImageSource } from '../../domain/token/index.js'

import type { TransactionEffect, TransactionSimulation } from '../../domain/transaction/index.js'
import type { Erc20ProviderPort, TokenData } from '../contracts/erc20.js'
import type { Provider } from '../provider/index.js'
import type { TransactionRequest } from '../../contracts/requests.js'
import type { CanonicalStoreReader } from '../store/actions.js'
import type { Token } from '../store/state/index.js'

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'

interface TokenTransfer {
  token: string
  from: string
  to: string
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
    }
  }
}

interface TraceCall {
  from?: string
  to?: string
  input?: string
  data?: string
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
  if (!topic || topic.length < 66) return ''
  return normalizeAddress(`0x${topic.slice(-40)}`)
}

function sameAddress(a?: string, b?: string) {
  const left = normalizeAddress(a)
  const right = normalizeAddress(b)
  return !!left && left === right
}

function decodeErc20CallData(data: string) {
  try {
    return erc20Interface.parseTransaction({ data }) || undefined
  } catch {
    return undefined
  }
}

function isErc20Transfer(data: TransactionDescription) {
  return (
    data.name === 'transfer' &&
    data.fragment.inputs.length === 2 &&
    (data.fragment.inputs[0].name || '').toLowerCase().endsWith('to') &&
    data.fragment.inputs[0].type === 'address' &&
    (data.fragment.inputs[1].name || '').toLowerCase().endsWith('value') &&
    data.fragment.inputs[1].type === 'uint256'
  )
}

function isErc20TransferFrom(data: TransactionDescription) {
  return (
    data.name === 'transferFrom' &&
    data.fragment.inputs.length === 3 &&
    (data.fragment.inputs[0].name || '').toLowerCase().endsWith('from') &&
    data.fragment.inputs[0].type === 'address' &&
    (data.fragment.inputs[1].name || '').toLowerCase().endsWith('to') &&
    data.fragment.inputs[1].type === 'address' &&
    (data.fragment.inputs[2].name || '').toLowerCase().endsWith('value') &&
    data.fragment.inputs[2].type === 'uint256'
  )
}

function walkTrace(trace: TraceCall | undefined, visit: (call: TraceCall) => void) {
  if (!trace || typeof trace !== 'object') return

  visit(trace)
  ;(trace.calls || []).forEach((call) => walkTrace(call, visit))
}

function extractTransfersFromLogs(trace: TraceCall) {
  const transfers: TokenTransfer[] = []

  walkTrace(trace, (call) => {
    if (call.error || call.revertReason) return
    ;(call.logs || []).forEach((event) => {
      const topics = event.topics || []
      if ((topics[0] || '').toLowerCase() !== TRANSFER_TOPIC) return

      const token = normalizeAddress(event.address)
      const from = topicAddress(topics[1])
      const to = topicAddress(topics[2])
      const amount = safeBigInt(event.data || '0x0')

      if (token && from && to && amount > 0n) {
        transfers.push({ token, from, to, amount })
      }
    })
  })

  return transfers
}

function extractTransfersFromCalls(trace: TraceCall) {
  const transfers: TokenTransfer[] = []

  walkTrace(trace, (call) => {
    if (call.error || call.revertReason) return

    const token = normalizeAddress(call.to)
    const input = call.input || call.data || ''
    if (!token || !input || input === '0x') return

    const decoded = decodeErc20CallData(input)
    if (!decoded) return

    if (isErc20Transfer(decoded)) {
      const from = normalizeAddress(call.from)
      const to = normalizeAddress(decoded.args[0]?.toString())
      const amount = safeBigInt(decoded.args[1]?.toString())

      if (from && to && amount > 0n) transfers.push({ token, from, to, amount })
    }

    if (isErc20TransferFrom(decoded)) {
      const from = normalizeAddress(decoded.args[0]?.toString())
      const to = normalizeAddress(decoded.args[1]?.toString())
      const amount = safeBigInt(decoded.args[2]?.toString())

      if (from && to && amount > 0n) transfers.push({ token, from, to, amount })
    }
  })

  return transfers
}

function nativeDeltaFromTrace(trace: TraceCall, account: string) {
  const accountAddress = normalizeAddress(account)
  let delta = 0n

  walkTrace(trace, (call) => {
    if (call.error || call.revertReason) return

    const value = safeBigInt(call.value)
    if (value <= 0n) return

    if (sameAddress(call.from, accountAddress)) delta -= value
    if (sameAddress(call.to, accountAddress)) delta += value
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
  req: TransactionRequest,
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
  req: TransactionRequest,
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
    const loaded = (await import('../contracts/erc20.js')).default as unknown
    const Erc20Contract = (
      loaded && typeof loaded === 'object' && 'default' in loaded ? loaded.default : loaded
    ) as typeof import('../contracts/erc20.js').default
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
  req: TransactionRequest,
  chainId: number,
  projection: TransactionSimulationProjection,
  provider?: Erc20ProviderPort
): Promise<TransactionEffect[]> {
  const effects = await Promise.all(
    [...deltas.entries()]
      .filter(([, delta]) => delta !== 0n)
      .map(async ([address, delta]) => {
        const metadata = await resolveTokenMetadata(req, address, chainId, projection, provider)
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
    provider.send(payload, (response) => {
      if (response?.error) return reject(response.error)
      resolve(response?.result as TraceCall)
    })
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
  req: TransactionRequest,
  nativeCurrency: NativeCurrencyLike,
  projection: TransactionSimulationProjection,
  provider?: Erc20ProviderPort
): Promise<TransactionEffect[]> {
  const chainId = parseInt(req.data.chainId, 16)
  const nativeDelta = nativeDeltaFromTrace(trace, req.account)
  const loggedTransfers = extractTransfersFromLogs(trace)
  const transfers = loggedTransfers.length ? loggedTransfers : extractTransfersFromCalls(trace)
  const tokenDeltas = tokenDeltasFromTransfers(transfers, req.account)
  const effects = [
    nativeEffect(nativeDelta, nativeCurrency),
    ...(await tokenEffects(tokenDeltas, req, chainId, projection, provider))
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
    return {
      status: 'success',
      source: 'debug_traceCall',
      effects: await effectsFromTrace(trace, req, nativeCurrency, projection, provider),
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
