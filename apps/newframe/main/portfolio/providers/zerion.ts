import type {
  PortfolioChainImage,
  PortfolioProvider,
  PortfolioRefreshOptions,
  PortfolioSnapshot
} from '../types'
import type { Balance, Rate, Token } from '../../store/state'
import ProviderRequestPolicy, { type ProviderRequestPolicyOptions } from '../requestPolicy'
import { NATIVE_CURRENCY } from '../../../resources/constants'
import { formatUnits } from '../../../resources/utils/numbers'

type Fetch = typeof fetch

interface ZerionProviderOptions {
  apiKey: string
  baseUrl?: string
  fetch?: Fetch
  requestPolicy?: ProviderRequestPolicy
  requestPolicyOptions?: ProviderRequestPolicyOptions
}

type ZerionChainMap = Record<number, string>

interface ZerionPortfolioResponse {
  data?: {
    attributes?: {
      positions_distribution_by_chain?: Record<string, number>
      total?: {
        positions?: number
      }
      changes?: {
        absolute_1d?: number
        percent_1d?: number
      }
    }
  }
}

let sharedRequestPolicy: ProviderRequestPolicy | undefined

function getSharedRequestPolicy(fetchImpl: Fetch) {
  if (!sharedRequestPolicy) {
    sharedRequestPolicy = new ProviderRequestPolicy(fetchImpl)
  }

  return sharedRequestPolicy
}

interface ZerionPosition {
  attributes?: {
    name?: string
    quantity?: {
      int?: string
      decimals?: number
      numeric?: string
    }
    value?: number
    price?: number
    changes?: {
      percent_1d?: number | null
    }
    fungible_info?: {
      name?: string
      symbol?: string
      icon?: {
        url?: string
      } | null
      implementations?: {
        chain_id?: string
        address?: string
        decimals?: number
      }[]
      market_data?: {
        changes?: {
          percent_1d?: number | null
        }
      }
    }
  }
  relationships?: {
    chain?: {
      data?: {
        id?: string
      }
    }
  }
}

interface ZerionPositionsResponse {
  data?: ZerionPosition[]
  links?: {
    next?: string | null
  }
}

interface ZerionChainResponse {
  data?: {
    attributes?: {
      icon?: {
        url?: string
      } | null
    }
  }
}

// Static snapshot from Zerion's chains endpoint. Runtime refresh deliberately
// avoids fetching /chains; new provider support should be added here in code.
const frameToZerionChainIds: ZerionChainMap = {
  1: 'ethereum',
  10: 'optimism',
  50: 'xinfin-xdc',
  56: 'binance-smart-chain',
  88: 'tomochain',
  100: 'xdai',
  130: 'unichain',
  137: 'polygon',
  143: 'monad',
  146: 'sonic',
  169: 'manta-pacific',
  196: 'okbchain',
  204: 'opbnb',
  232: 'lens',
  250: 'fantom',
  252: 'fraxtal',
  320: 'zkcandy',
  324: 'zksync-era',
  388: 'cronos-zkevm',
  480: 'world',
  690: 'redstone',
  999: 'hyperevm',
  1088: 'metis-andromeda',
  1101: 'polygon-zkevm',
  1135: 'lisk',
  1329: 'sei',
  1625: 'gravity-alpha',
  1868: 'soneium',
  1923: 'swellchain',
  2020: 'ronin',
  2741: 'abstract',
  3776: 'astar-zkevm',
  4217: 'tempo',
  4326: 'megaeth',
  5000: 'mantle',
  5031: 'somnia',
  7560: 'cyber',
  8008: 'polynomial',
  8453: 'base',
  9637: 'wonder',
  9745: 'plasma',
  16661: '0g',
  33139: 'ape',
  34443: 'mode',
  42161: 'arbitrum',
  42220: 'celo',
  43114: 'avalanche',
  57073: 'ink',
  59144: 'linea',
  60808: 'bob',
  80094: 'berachain',
  81457: 'blast',
  111188: 're-al',
  167000: 'taiko',
  534352: 'scroll',
  543210: 'zero',
  747474: 'katana',
  810180: 'zklink-nova',
  7777777: 'zora',
  666666666: 'degen',
  1313161554: 'aurora',
  1380012617: 'rari'
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values))
}

const zerionToFrameChainIds = Object.entries(frameToZerionChainIds).reduce(
  (chains, [frameChainId, zerionChainId]) => {
    chains[zerionChainId] = parseInt(frameChainId, 10)
    return chains
  },
  {} as Record<string, number>
)

export function supportsPortfolioChain(chainId: number) {
  return Boolean(frameToZerionChainIds[chainId])
}

export function toZerionChainIds(chainIds: number[]) {
  return unique(
    chainIds
      .map((chainId) => frameToZerionChainIds[chainId])
      .filter((chainId): chainId is string => Boolean(chainId))
  )
}

function isEvmAddress(address?: string): address is string {
  return typeof address === 'string' && /^0x[a-fA-F0-9]{40}$/.test(address)
}

function getPositionChainId(
  position: ZerionPosition,
  allowedChains: Set<string>,
  zerionToFrameChainIds: Record<string, number>
) {
  const zerionChainId = position.relationships?.chain?.data?.id
  if (!zerionChainId || !allowedChains.has(zerionChainId)) return undefined

  return zerionToFrameChainIds[zerionChainId]
}

function getPositionImplementation(position: ZerionPosition) {
  const zerionChainId = position.relationships?.chain?.data?.id
  return position.attributes?.fungible_info?.implementations?.find((impl) => impl.chain_id === zerionChainId)
}

function hasPositiveQuantity(position: ZerionPosition) {
  const quantity = position.attributes?.quantity?.int
  if (quantity === undefined) return true

  try {
    return BigInt(quantity) > 0n
  } catch {
    return false
  }
}

function getPositionToken(
  position: ZerionPosition,
  allowedChains: Set<string>,
  zerionToFrameChainIds: Record<string, number>
): Token | undefined {
  if (!hasPositiveQuantity(position)) return undefined

  const chainId = getPositionChainId(position, allowedChains, zerionToFrameChainIds)
  if (!chainId) return undefined

  const fungible = position.attributes?.fungible_info
  const implementation = getPositionImplementation(position)
  const address = implementation?.address?.toLowerCase()
  const decimals = implementation?.decimals

  if (
    !isEvmAddress(address) ||
    address === NATIVE_CURRENCY ||
    typeof decimals !== 'number' ||
    decimals <= 0
  ) {
    return undefined
  }

  const symbol = fungible?.symbol || address
  const name = fungible?.name || symbol

  return {
    address,
    chainId,
    name,
    symbol,
    decimals,
    logoURI: fungible?.icon?.url || ''
  }
}

function quantityInt(position: ZerionPosition) {
  const rawQuantity = position.attributes?.quantity?.int
  if (rawQuantity === undefined) return undefined

  try {
    const quantity = BigInt(rawQuantity)
    return quantity > 0n ? quantity : undefined
  } catch {
    return undefined
  }
}

function quantityHex(quantity: bigint) {
  return `0x${quantity.toString(16)}`
}

function getPositionNativeBalance(
  position: ZerionPosition,
  allowedChains: Set<string>,
  zerionToFrameChainIds: Record<string, number>
): Balance | undefined {
  if (!hasPositiveQuantity(position)) return undefined

  const chainId = getPositionChainId(position, allowedChains, zerionToFrameChainIds)
  if (!chainId) return undefined

  const implementation = getPositionImplementation(position)
  const implementations = position.attributes?.fungible_info?.implementations || []
  const implementationAddress = implementation?.address?.toLowerCase()

  if (!implementation && implementations.length > 0) return undefined
  if (isEvmAddress(implementationAddress) && implementationAddress !== NATIVE_CURRENCY) return undefined

  const quantity = quantityInt(position)
  if (quantity === undefined) return undefined

  const fungible = position.attributes?.fungible_info
  const nativeDecimals = position.attributes?.quantity?.decimals
  const decimals = typeof nativeDecimals === 'number' && nativeDecimals > 0 ? nativeDecimals : 18
  const symbol = fungible?.symbol || position.attributes?.name || 'Native'
  const name = fungible?.name || symbol

  return {
    address: NATIVE_CURRENCY,
    chainId,
    name,
    symbol,
    decimals,
    balance: quantityHex(quantity),
    displayBalance: position.attributes?.quantity?.numeric || formatUnits(quantity, decimals)
  }
}

function getPositionBalance(
  position: ZerionPosition,
  allowedChains: Set<string>,
  zerionToFrameChainIds: Record<string, number>
): Balance | undefined {
  const token = getPositionToken(position, allowedChains, zerionToFrameChainIds)
  const quantity = quantityInt(position)

  if (!token) return getPositionNativeBalance(position, allowedChains, zerionToFrameChainIds)
  if (quantity === undefined) return undefined

  return {
    ...token,
    balance: quantityHex(quantity),
    displayBalance: position.attributes?.quantity?.numeric || formatUnits(quantity, token.decimals)
  }
}

function getPositionRate(position: ZerionPosition): Rate | undefined {
  const price = position.attributes?.price
  if (typeof price !== 'number') return undefined

  return {
    price,
    change24hr:
      position.attributes?.changes?.percent_1d ??
      position.attributes?.fungible_info?.market_data?.changes?.percent_1d ??
      0
  }
}

function extractTokens(
  positions: ZerionPosition[],
  zerionChainIds: string[],
  zerionToFrameChainIds: Record<string, number>
) {
  const allowedChains = new Set(zerionChainIds)
  const tokens = new Map<string, Token>()

  positions.forEach((position) => {
    const token = getPositionToken(position, allowedChains, zerionToFrameChainIds)
    if (token) {
      tokens.set(`${token.chainId}:${token.address}`, token)
    }
  })

  return Array.from(tokens.values())
}

function extractBalances(
  positions: ZerionPosition[],
  zerionChainIds: string[],
  zerionToFrameChainIds: Record<string, number>
) {
  const allowedChains = new Set(zerionChainIds)
  const balances = new Map<string, Balance>()

  positions.forEach((position) => {
    const balance = getPositionBalance(position, allowedChains, zerionToFrameChainIds)
    if (balance) {
      balances.set(`${balance.chainId}:${balance.address}`, balance)
    }
  })

  return Array.from(balances.values())
}

function extractRates(
  positions: ZerionPosition[],
  zerionChainIds: string[],
  zerionToFrameChainIds: Record<string, number>
) {
  const allowedChains = new Set(zerionChainIds)
  const rates: Record<Address, { usd: Rate }> = {}

  positions.forEach((position) => {
    const token = getPositionToken(position, allowedChains, zerionToFrameChainIds)
    const rate = getPositionRate(position)
    if (token && rate) {
      rates[token.address as Address] = { usd: rate }
    }
  })

  return rates
}

function extractNativeRates(
  positions: ZerionPosition[],
  zerionChainIds: string[],
  zerionToFrameChainIds: Record<string, number>
) {
  const allowedChains = new Set(zerionChainIds)
  const rates: Record<number, Rate> = {}

  positions.forEach((position) => {
    const balance = getPositionNativeBalance(position, allowedChains, zerionToFrameChainIds)
    const rate = getPositionRate(position)
    if (balance && rate) {
      rates[balance.chainId] = rate
    }
  })

  return rates
}

function mapChainValues(
  distribution: Record<string, number> = {},
  zerionChainIds: string[],
  zerionToFrameChainIds: Record<string, number>
) {
  const allowedChains = new Set(zerionChainIds)

  return Object.entries(distribution).reduce(
    (values, [zerionChainId, value]) => {
      if (!allowedChains.has(zerionChainId)) return values

      const chainId = zerionToFrameChainIds[zerionChainId]
      if (chainId) values[chainId] = value
      return values
    },
    {} as Record<number, number>
  )
}

function emptyPortfolioSnapshot(): PortfolioSnapshot {
  return {
    totalValue: 0,
    absoluteChange1d: 0,
    percentChange1d: 0,
    chainValues: {},
    tokens: [],
    balances: [],
    rates: {},
    nativeRates: {}
  }
}

export default class ZerionPortfolioProvider implements PortfolioProvider {
  private readonly apiKey: string
  private readonly baseUrl: string
  private readonly requestPolicy: ProviderRequestPolicy

  constructor({
    apiKey,
    baseUrl = 'https://api.zerion.io/v1',
    fetch: fetchImpl = fetch,
    requestPolicy,
    requestPolicyOptions
  }: ZerionProviderOptions) {
    if (!apiKey) throw new Error('Zerion API key is required')

    this.apiKey = apiKey
    this.baseUrl = baseUrl.replace(/\/+$/, '')
    this.requestPolicy =
      requestPolicy ||
      (fetchImpl === fetch
        ? getSharedRequestPolicy(fetchImpl)
        : new ProviderRequestPolicy(fetchImpl, requestPolicyOptions))
  }

  async getWalletPortfolio(
    address: Address,
    chainIds: number[],
    options: PortfolioRefreshOptions = {}
  ): Promise<PortfolioSnapshot> {
    const zerionChainIds = toZerionChainIds(chainIds)
    if (zerionChainIds.length === 0) return emptyPortfolioSnapshot()

    const portfolio = await this.fetchPortfolio(address, options)
    const positions = await this.fetchPositions(address, zerionChainIds, options)

    const attributes = portfolio.data?.attributes || {}
    const changes = attributes.changes || {}

    return {
      totalValue: attributes.total?.positions || 0,
      absoluteChange1d: changes.absolute_1d || 0,
      percentChange1d: changes.percent_1d || 0,
      chainValues: mapChainValues(
        attributes.positions_distribution_by_chain,
        zerionChainIds,
        zerionToFrameChainIds
      ),
      tokens: extractTokens(positions, zerionChainIds, zerionToFrameChainIds),
      balances: extractBalances(positions, zerionChainIds, zerionToFrameChainIds),
      rates: extractRates(positions, zerionChainIds, zerionToFrameChainIds),
      nativeRates: extractNativeRates(positions, zerionChainIds, zerionToFrameChainIds)
    }
  }

  async getChainImage(chainId: number): Promise<PortfolioChainImage | undefined> {
    const zerionChainId = frameToZerionChainIds[chainId]
    if (!zerionChainId) return undefined

    const chain = await this.request<ZerionChainResponse>(`/chains/${encodeURIComponent(zerionChainId)}`, {})
    const imageUrl = chain.data?.attributes?.icon?.url

    return imageUrl ? { url: imageUrl } : undefined
  }

  private async fetchPortfolio(address: Address, options: PortfolioRefreshOptions) {
    return this.request<ZerionPortfolioResponse>(`/wallets/${address}/portfolio`, {
      currency: 'usd',
      'filter[positions]': 'only_simple',
      sync: options.sync ? 'true' : 'false'
    })
  }

  private async fetchPositions(address: Address, chainIds: string[], options: PortfolioRefreshOptions) {
    const positions: ZerionPosition[] = []
    let nextUrl: string | undefined

    do {
      const response = nextUrl
        ? await this.requestUrl<ZerionPositionsResponse>(nextUrl)
        : await this.request<ZerionPositionsResponse>(`/wallets/${address}/positions/`, {
            currency: 'usd',
            sort: '-value',
            'filter[positions]': 'only_simple',
            'filter[trash]': 'only_non_trash',
            'filter[chain_ids]': chainIds.join(','),
            sync: options.sync ? 'true' : 'false'
          })

      positions.push(...(response.data || []))
      nextUrl = response.links?.next || undefined
    } while (nextUrl)

    return positions
  }

  private request<T>(path: string, params: Record<string, string>) {
    const url = new URL(`${this.baseUrl}${path}`)

    Object.entries(params).forEach(([key, value]) => {
      if (value) url.searchParams.set(key, value)
    })

    return this.requestUrl<T>(url.toString())
  }

  private async requestUrl<T>(url: string) {
    const response = await this.requestPolicy.request(url, {
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.apiKey}:`).toString('base64')}`
      }
    })

    if (!response.ok) {
      const details = await response.text().catch(() => '')
      const suffix = details ? `: ${details.slice(0, 200)}` : ''
      throw new Error(
        `Portfolio provider request failed (${response.status} ${response.statusText})${suffix}`
      )
    }

    return (await response.json()) as T
  }
}
