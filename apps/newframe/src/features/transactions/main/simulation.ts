import { addHexPrefix } from '@ethereumjs/util'
import log from 'electron-log'
import { getAddress, isAddress } from 'ethers'
import { z } from 'zod'

import { getProfileAccountIds } from '../../../app/contracts/state/main.ts'
import type { RpcIpcHandlers } from '../../../app/main/ipc-handlers/rpc.ts'
import type { Erc20ProviderPort, TokenData } from '../../../core/services/chains/rpc/contracts/erc20.ts'
import type { CanonicalStoreReader } from '../../../core/state/store/actions.ts'
import type { Token } from '../../../core/state/store/state/index.ts'
import { persistedImageSource } from '../../asset-data/domain/image/index.ts'
import type { TransactionRequest } from '../../requests/contract/requests.ts'
import { NATIVE_CURRENCY } from '../../tokens/domain/constants.ts'
import { tokenImageSource } from '../../tokens/domain/index.ts'
import type { TransactionEffect, TransactionSimulation } from '../domain/index.ts'

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const APPROVAL_TOPIC = '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925'
// eth_simulateV1 with traceTransfers reports native value moves as ERC20-shaped Transfer logs from this address.
const NATIVE_TRANSFER_EMITTER = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
const hexBytes = z.string().regex(/^0x(?:[0-9a-f]{2})*$/i)
const simulatedLogSchema = z.object({
  address: z.string().refine(isAddress),
  topics: z.array(z.string().regex(/^0x[0-9a-f]{64}$/i)).max(4),
  data: hexBytes
})
const simulatedCallSchema = z.object({
  status: z.enum(['0x0', '0x1']),
  returnData: hexBytes,
  logs: z.array(simulatedLogSchema).default([]),
  error: z.object({ message: z.string() }).optional()
})
const simulationResultSchema = z.array(z.object({ calls: z.array(simulatedCallSchema) })).length(1)
export type SimulatedLog = z.infer<typeof simulatedLogSchema>
export type SimulatedCall = z.infer<typeof simulatedCallSchema>
export type SimulationStateOverrides = Record<
  string,
  { balance?: string; stateDiff?: Record<string, string> }
>

export function simulationParams(
  calls: Array<Record<string, string>>,
  blockTag: string,
  stateOverrides?: SimulationStateOverrides
) {
  return [
    { blockStateCalls: [{ ...(stateOverrides ? { stateOverrides } : {}), calls }], traceTransfers: true },
    blockTag
  ]
}

export function simulatedCalls(result: unknown, count: number): SimulatedCall[] {
  const parsed = simulationResultSchema.safeParse(result)
  if (!parsed.success || parsed.data[0].calls.length !== count) {
    throw new Error('RPC returned an invalid simulation')
  }
  return parsed.data[0].calls
}

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

type TransactionSimulationProviderPort = Pick<RpcIpcHandlers, 'send'> & Erc20ProviderPort

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
      const metadata = canonicalStore.getState().main.chainsMeta.ethereum as Record<
        number,
        ReturnType<typeof canonicalStore.getState>['main']['chainsMeta']['ethereum'][number] | undefined
      >
      return metadata[chainId]?.nativeCurrency ?? {}
    },
    getToken(address, chainId) {
      const tokens = canonicalStore.getState().main.tokens.byId as Record<
        string,
        ReturnType<typeof canonicalStore.getState>['main']['tokens']['byId'][string] | undefined
      >
      return tokens[`${chainId}:${normalizeAddress(address)}`]
    },
    getProfileAccounts(originatingAccountAddress) {
      const main = canonicalStore.getState().main
      const normalizedOrigin = normalizeAddress(originatingAccountAddress)
      if (!normalizedOrigin) {
        return
      }

      const accounts = main.accounts as Record<string, (typeof main.accounts)[string] | undefined>
      const originatingAccount =
        accounts[originatingAccountAddress] ??
        accounts[normalizedOrigin] ??
        Object.values(main.accounts).find((account) => normalizeAddress(account.address) === normalizedOrigin)

      if (!originatingAccount) {
        return
      }

      const accountAddresses = [
        ...new Set(
          getProfileAccountIds(main, originatingAccount.profileId)
            .map((id) => normalizeAddress(accounts[id]?.address))
            .filter(Boolean)
        )
      ]

      return { profileId: originatingAccount.profileId, accountAddresses }
    }
  }
}

interface NativeTransfer {
  from: string
  to: string
  amount: bigint
}

interface ParsedLogs {
  nativeTransfers: NativeTransfer[]
  tokenTransfers: TokenTransfer[]
  tokenApprovals: TokenApproval[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function safeBigInt(value?: string | number | bigint | null) {
  if (value === undefined || value === null || value === '') {
    return 0n
  }

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
  if (!address || !isAddress(address)) {
    return ''
  }

  try {
    return getAddress(address).toLowerCase()
  } catch {
    return ''
  }
}

function topicAddress(topic?: string) {
  if (!topic || !/^0x0{24}[0-9a-f]{40}$/i.test(topic)) {
    return ''
  }
  return normalizeAddress(`0x${topic.slice(-40)}`)
}

function sameAddress(a?: string, b?: string) {
  const left = normalizeAddress(a)
  const right = normalizeAddress(b)
  return !!left && left === right
}

function parseLogs(logs: SimulatedLog[]): ParsedLogs {
  const parsed: ParsedLogs = { nativeTransfers: [], tokenTransfers: [], tokenApprovals: [] }
  for (const event of logs) {
    const topics = event.topics
    if (topics.length !== 3 || !/^0x[0-9a-f]{64}$/i.test(event.data)) {
      continue
    }
    const topic = topics[0].toLowerCase()
    const emitter = normalizeAddress(event.address)
    const from = topicAddress(topics[1])
    const to = topicAddress(topics[2])
    const amount = safeBigInt(event.data)
    if (!emitter || !from || !to || (topic !== TRANSFER_TOPIC && topic !== APPROVAL_TOPIC)) {
      continue
    }
    if (topic === TRANSFER_TOPIC && amount > 0n) {
      if (emitter === NATIVE_TRANSFER_EMITTER) {
        parsed.nativeTransfers.push({ from, to, amount })
      } else {
        parsed.tokenTransfers.push({ token: emitter, from, to, amount })
      }
    }
    if (topic === APPROVAL_TOPIC && emitter !== NATIVE_TRANSFER_EMITTER) {
      parsed.tokenApprovals.push({ token: emitter, owner: from, spender: to, amount })
    }
  }
  return parsed
}

function nativeDeltaFromTransfers(transfers: NativeTransfer[], account: string) {
  const accountAddress = normalizeAddress(account)
  let delta = 0n

  transfers.forEach((transfer) => {
    if (sameAddress(transfer.from, accountAddress)) {
      delta -= transfer.amount
    }
    if (sameAddress(transfer.to, accountAddress)) {
      delta += transfer.amount
    }
  })

  return delta
}

function tokenDeltasFromTransfers(transfers: TokenTransfer[], account: string) {
  const accountAddress = normalizeAddress(account)
  const deltas = new Map<string, bigint>()

  transfers.forEach((transfer) => {
    const current = deltas.get(transfer.token) ?? 0n
    let next = current

    if (sameAddress(transfer.from, accountAddress)) {
      next -= transfer.amount
    }
    if (sameAddress(transfer.to, accountAddress)) {
      next += transfer.amount
    }

    if (next !== current) {
      deltas.set(transfer.token, next)
    }
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

  const matchingData = (req.recognizedActions ?? [])
    .map((action) => action.data)
    .find((data) => {
      if (!isRecord(data)) {
        return false
      }
      const contract = data.contract
      const contractAddress = isRecord(contract) ? contract.address : contract
      return typeof contractAddress === 'string' && sameAddress(contractAddress, address)
    })

  if (isRecord(matchingData)) {
    const decimals = matchingData.decimals
    const logoURI = matchingData.logoURI
    const name = matchingData.name
    const symbol = matchingData.symbol
    let tokenName = 'Token'
    if (typeof name === 'string') {
      tokenName = name
    } else if (typeof symbol === 'string') {
      tokenName = symbol
    }
    return {
      address,
      chainId,
      decimals: typeof decimals === 'number' ? decimals : undefined,
      logoURI: typeof logoURI === 'string' ? logoURI : undefined,
      name: tokenName,
      symbol: typeof symbol === 'string' ? symbol : 'Token'
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
  if (requestToken) {
    return requestToken
  }

  if (!provider) {
    return {
      address,
      chainId,
      name: 'Token',
      symbol: 'Token'
    }
  }

  try {
    const loaded = (await import('../../../core/services/chains/rpc/contracts/erc20.ts')).default as unknown
    const Erc20Contract = (
      loaded && typeof loaded === 'object' && 'default' in loaded ? loaded.default : loaded
    ) as typeof import('../../../core/services/chains/rpc/contracts/erc20.ts').default
    const tokenData = await new Erc20Contract(address, chainId, provider).getTokenData()
    return {
      ...tokenData,
      address,
      chainId,
      name: tokenData.name || tokenData.symbol || 'Token',
      symbol: tokenData.symbol || 'Token'
    }
  } catch (error) {
    log.warn('unable to resolve simulated token metadata', {
      address,
      chainId,
      error
    })
    return {
      address,
      chainId,
      name: 'Token',
      symbol: 'Token'
    }
  }
}

function nativeEffect(delta: bigint, nativeCurrency: NativeCurrencyLike): TransactionEffect | undefined {
  if (delta === 0n) {
    return
  }

  const direction = delta < 0n ? 'out' : 'in'

  return {
    id: 'sim-native',
    kind: 'native',
    direction,
    label: direction === 'out' ? 'Asset out' : 'Asset in',
    amount: toHexQuantity(abs(delta)),
    decimals: nativeCurrency.decimals ?? 18,
    symbol: nativeCurrency.symbol ?? 'ETH',
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
      .map(async ([address, delta]): Promise<TransactionEffect> => {
        const metadataPromise =
          metadataByAddress.get(address) ?? resolveTokenMetadata(req, address, chainId, projection, provider)
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
        }
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
          metadataByAddress.get(approval.token) ??
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

function simulationCall(req: TransactionRequest) {
  const data = req.data
  const call = {
    from: data.from ?? req.account,
    to: data.to,
    gas: data.gasLimit ?? data.gas,
    value: data.value ?? '0x0',
    data: data.data ?? '0x'
  }
  return Object.fromEntries(
    Object.entries(call).filter(
      (entry): entry is [string, string] => entry[1] !== undefined && entry[1] !== ''
    )
  )
}

async function simulate(
  req: TransactionRequest,
  chainId: number,
  provider: TransactionSimulationProviderPort
) {
  const payload = {
    id: Date.now(),
    jsonrpc: '2.0',
    method: 'eth_simulateV1',
    params: simulationParams([simulationCall(req)], 'latest'),
    chainId: addHexPrefix(chainId.toString(16)),
    _origin: 'newframe-internal'
  } as const

  return new Promise<SimulatedCall>((resolve, reject) => {
    Promise.resolve(
      provider.send(payload, (response) => {
        if (response.error) {
          return reject(response.error)
        }
        try {
          resolve(simulatedCalls(response.result, 1)[0])
        } catch (error) {
          reject(error)
        }
      })
    ).catch(reject)
  })
}

function simulationUnavailable(error: unknown): TransactionSimulation {
  let message = 'Transaction simulation unavailable'
  if (typeof error === 'string') {
    message = error
  } else if (error && typeof error === 'object' && 'message' in error) {
    message = String((error as { message?: unknown }).message)
  }

  return {
    status: 'unavailable',
    source: 'eth_simulateV1',
    error: message,
    updatedAt: Date.now()
  }
}

export async function effectsFromLogs(
  logs: SimulatedLog[],
  req: SimulationEffectContext,
  nativeCurrency: NativeCurrencyLike,
  projection: TransactionSimulationProjection,
  provider?: Erc20ProviderPort
): Promise<TransactionEffect[]> {
  return effectsFromParsedLogs(parseLogs(logs), req, nativeCurrency, projection, provider)
}

async function effectsFromParsedLogs(
  parsed: ParsedLogs,
  req: SimulationEffectContext,
  nativeCurrency: NativeCurrencyLike,
  projection: TransactionSimulationProjection,
  provider?: Erc20ProviderPort,
  metadataByAddress = new Map<string, Promise<TokenMetadata>>(),
  account = req.account
): Promise<TransactionEffect[]> {
  const chainId = parseInt(req.data.chainId, 16)
  const nativeDelta = nativeDeltaFromTransfers(parsed.nativeTransfers, account)
  const tokenDeltas = tokenDeltasFromTransfers(parsed.tokenTransfers, account)
  const effects = [
    nativeEffect(nativeDelta, nativeCurrency),
    ...(await tokenEffects(tokenDeltas, req, chainId, projection, provider, metadataByAddress)),
    ...(await approvalEffects(
      parsed.tokenApprovals,
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
      source: 'eth_simulateV1',
      error: 'Contract deployment simulation is not supported yet',
      updatedAt: Date.now()
    }
  }

  let call: SimulatedCall

  try {
    call = await simulate(req, chainId, provider)
  } catch (error) {
    log.warn('transaction simulation unavailable', {
      requestId: req.requestId,
      error
    })
    return simulationUnavailable(error)
  }

  if (call.status === '0x0') {
    return {
      status: 'error',
      source: 'eth_simulateV1',
      error: call.error?.message ?? 'Transaction simulation reverted',
      updatedAt: Date.now()
    }
  }

  try {
    const parsedLogs = parseLogs(call.logs)
    const metadataByAddress = new Map<string, Promise<TokenMetadata>>()
    const effects = await effectsFromParsedLogs(
      parsedLogs,
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
                await effectsFromParsedLogs(
                  parsedLogs,
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
      source: 'eth_simulateV1',
      effects,
      ...(profile ? { effectsByAccount, effectsProfileId: profile.profileId } : {}),
      updatedAt: Date.now()
    }
  } catch (error) {
    log.warn('transaction simulation failed', {
      requestId: req.requestId,
      error
    })
    return {
      status: 'error',
      source: 'eth_simulateV1',
      error: error instanceof Error ? error.message : 'Transaction simulation failed',
      updatedAt: Date.now()
    }
  }
}
