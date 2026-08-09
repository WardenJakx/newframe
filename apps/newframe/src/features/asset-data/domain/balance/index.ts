import { NATIVE_CURRENCY } from '../../../tokens/domain/constants.js'
import { formatUnits, toBigInt } from '../../../../shared/domain/units.js'
import { persistedImageSource } from '../image/index.js'
import { tokenFromBalance, tokenImageSource, toTokenId } from '../../../tokens/domain/index.js'
import { resolveAssetRate } from '../asset/index.js'

import type { Balance } from '../state/balance.js'
import type { AssetRateMap, ResolvedAssetRate } from '../state/rate.js'
import type { TokenCatalog } from '../../../tokens/domain/state/token.js'

export interface DisplayedBalance extends Balance {
  decimals: number
  displayBalance: string
  logoURI?: string
  name: string
  price: string
  priceChange: string | false
  symbol: string
  rate?: ResolvedAssetRate
  hasPrice: boolean
  totalValue: number
  displayValue: string
}

export interface BalanceSummary extends Balance {
  decimals: number
  hasPrice: boolean
  logoURI?: string
  name: string
  rate?: ResolvedAssetRate
  symbol: string
  totalValue: number
  unformattedBalance: number
}

interface BalanceInput extends Partial<Balance> {
  address: string
  balance: string
  chainId: number
  decimals?: number
  displayBalance?: string
  logoURI?: string
  name?: string
  symbol?: string
}

interface ChainLike {
  connection?: {
    primary?: { connected?: boolean }
    secondary?: { connected?: boolean }
  }
  isTestnet?: boolean
  name?: string
  on?: boolean
}

interface NativeCurrencyInfo {
  decimals?: number
  icon?: string
  name?: string
  symbol?: string
}

interface NetworkMetaLike {
  nativeCurrency?: NativeCurrencyInfo
}

type NetworkMap = Record<string | number, ChainLike>
type NetworkMetaMap = Record<string | number, NetworkMetaLike>

interface BalanceSummaryOptions {
  rawBalances: BalanceInput[]
  assetRates?: AssetRateMap
  networks?: NetworkMap
  networksMeta?: NetworkMetaMap
  tokens?: TokenCatalog
  includeChain?: (chain: ChainLike, balance: BalanceInput) => boolean
  includeBalance?: (balance: BalanceInput) => boolean
}

interface BalanceSummarySelectorOptions extends BalanceSummaryOptions {
  cacheKey?: unknown
}

const UNKNOWN = '?'
const includeAllChains = () => true
const EMPTY_NETWORKS: NetworkMap = {}
const EMPTY_NETWORKS_META: NetworkMetaMap = {}
const EMPTY_ASSET_RATES: AssetRateMap = {}
const EMPTY_TOKENS: TokenCatalog = { byId: {}, accountTokenIds: {} }
export const MAINNET_ETH_ICON = 'https://assets.coingecko.com/coins/images/279/large/ethereum.png?1595348880'

function floorTo(value: number, decimals: number) {
  const scale = 10 ** decimals
  return Math.floor(value * scale) / scale
}

function balanceValue({ balance, decimals }: { balance?: string; decimals: number }) {
  return Number(formatUnits(toBigInt(balance || 0) ?? 0n, decimals))
}

function formatBalance(balance: number, totalValue: number, decimals = 8) {
  if (balance !== 0 && balance < 0.001 && totalValue < 1) return '<0.001'

  return new Intl.NumberFormat('us-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8
  }).format(floorTo(balance, decimals))
}

export function formatUsdRate(rate: number, decimals = 2) {
  return isNaN(rate)
    ? UNKNOWN
    : new Intl.NumberFormat('us-US', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      }).format(floorTo(rate, decimals))
}

export function createBalance(
  rawBalance: Balance & { decimals: number; logoURI?: string; name: string; symbol: string },
  rate?: ResolvedAssetRate
): DisplayedBalance {
  const balance = balanceValue(rawBalance)
  const hasPrice = typeof rate?.usdRate === 'number' && !isNaN(rate.usdRate)
  const usdRate = hasPrice ? rate.usdRate : NaN
  const change24hr = rate?.change24hr || 0

  const totalValue = balance * usdRate
  const balanceDecimals = hasPrice ? Math.max(2, Math.trunc(usdRate * 10).toString().length) : 8

  return {
    ...rawBalance,
    rate,
    hasPrice,
    displayBalance: formatBalance(balance, totalValue, balanceDecimals),
    price: formatUsdRate(usdRate),
    priceChange: usdRate !== 0 && !isNaN(usdRate) && change24hr.toFixed(2),
    totalValue: isNaN(totalValue) ? 0 : totalValue,
    displayValue: totalValue === 0 ? '0' : formatUsdRate(totalValue, 0)
  }
}

function createBalanceSummary({
  rawBalance,
  assetRates = {},
  networks = {},
  networksMeta = {},
  tokens = { byId: {}, accountTokenIds: {} }
}: {
  rawBalance: BalanceInput
  assetRates?: AssetRateMap
  networks?: NetworkMap
  networksMeta?: NetworkMetaMap
  tokens?: TokenCatalog
}): BalanceSummary {
  const chain = networks[rawBalance.chainId] || {}
  const isNative = isNativeCurrency(rawBalance.address)
  const nativeCurrencyInfo = networksMeta[rawBalance.chainId]?.nativeCurrency || {}
  const token = tokenFromBalance(tokens, rawBalance, nativeCurrencyInfo)
  const decimals = token?.decimals ?? rawBalance.decimals ?? 18
  const resolvedRate = resolveAssetRate(
    {
      chainId: rawBalance.chainId,
      address: rawBalance.address,
      ...(isNative && nativeCurrencyInfo.symbol ? { nativeTicker: nativeCurrencyInfo.symbol } : {})
    },
    assetRates
  )
  const hasPrice = typeof resolvedRate?.usdRate === 'number' && !isNaN(resolvedRate.usdRate)
  const unformattedBalance = balanceValue({ balance: rawBalance.balance, decimals })
  const totalValue = hasPrice ? unformattedBalance * resolvedRate.usdRate : 0

  return {
    ...rawBalance,
    address: rawBalance.address,
    balance: rawBalance.balance,
    chainId: rawBalance.chainId,
    decimals,
    displayBalance: rawBalance.displayBalance || '',
    hasPrice,
    logoURI: tokenImageSource(token) || (isNative ? getNativeCurrencyIcon(nativeCurrencyInfo) : undefined),
    name: token?.name || (isNative ? chain.name || '' : rawBalance.name || ''),
    rate: resolvedRate,
    symbol: token?.symbol || rawBalance.symbol || '',
    totalValue: isNaN(totalValue) ? 0 : totalValue,
    unformattedBalance
  }
}

export function createBalanceSummaries({
  rawBalances,
  assetRates = EMPTY_ASSET_RATES,
  networks = EMPTY_NETWORKS,
  networksMeta = EMPTY_NETWORKS_META,
  tokens = EMPTY_TOKENS,
  includeChain = includeAllChains,
  includeBalance = hasPositiveBalance
}: BalanceSummaryOptions) {
  return rawBalances
    .filter((rawBalance) => {
      const chain = networks[rawBalance.chainId]
      return !!chain && !!networksMeta[rawBalance.chainId] && includeChain(chain, rawBalance)
    })
    .filter(includeBalance)
    .map((rawBalance) => createBalanceSummary({ rawBalance, assetRates, networks, networksMeta, tokens }))
    .sort(sortBalanceSummariesByTotalValue)
}

export function createBalanceSummarySelector() {
  let cache: {
    cacheKey: unknown
    rawBalances: unknown
    assetRates: unknown
    tokens: unknown
    networks: unknown
    networksMeta: unknown
    balances: BalanceSummary[]
  } | null = null

  return ({
    rawBalances,
    assetRates = EMPTY_ASSET_RATES,
    networks = EMPTY_NETWORKS,
    networksMeta = EMPTY_NETWORKS_META,
    tokens = EMPTY_TOKENS,
    includeChain = includeAllChains,
    includeBalance = hasPositiveBalance,
    cacheKey = includeChain
  }: BalanceSummarySelectorOptions) => {
    if (
      cache &&
      cache.cacheKey === cacheKey &&
      cache.rawBalances === rawBalances &&
      cache.assetRates === assetRates &&
      cache.tokens === tokens &&
      cache.networks === networks &&
      cache.networksMeta === networksMeta
    ) {
      return cache.balances
    }

    const balances = createBalanceSummaries({
      rawBalances,
      assetRates,
      networks,
      networksMeta,
      tokens,
      includeChain,
      includeBalance
    })

    cache = {
      cacheKey,
      rawBalances,
      assetRates,
      tokens,
      networks,
      networksMeta,
      balances
    }

    return balances
  }
}

export function createDisplayBalance(balance: BalanceSummary): DisplayedBalance {
  const { rate, unformattedBalance, ...rawBalance } = balance

  return createBalance(rawBalance, rate)
}

export function createBalanceTokenSelectorItem(balance: BalanceSummary) {
  const displayBalance = createDisplayBalance(balance)

  return {
    id: toTokenId(balance),
    symbol: displayBalance.symbol,
    searchText: [displayBalance.name, displayBalance.address].filter(Boolean).join(' '),
    amountLabel: displayBalance.displayBalance,
    notionalLabel: formatBalanceNotionalValue(displayBalance),
    chainId: displayBalance.chainId,
    logoURI: balance.logoURI
  }
}

export function hasPositiveBalance(balance: { balance?: string }) {
  return (toBigInt(balance.balance || 0) ?? 0n) > 0n
}

export const sortByTotalValue = (a: DisplayedBalance, b: DisplayedBalance) => {
  const difference = b.totalValue - a.totalValue
  if (difference !== 0) {
    return difference
  }

  return balanceValue(b) - balanceValue(a)
}

const sortBalanceSummariesByTotalValue = (a: BalanceSummary, b: BalanceSummary) => {
  const difference = b.totalValue - a.totalValue
  if (difference !== 0) {
    return difference
  }

  return b.unformattedBalance - a.unformattedBalance
}

export function isNativeCurrency(address: string) {
  return address === NATIVE_CURRENCY
}

function getNativeCurrencyIcon(nativeCurrency: {
  image?: { base64?: string; mimeType?: string }
  symbol?: string
}) {
  return persistedImageSource(nativeCurrency.image)
}

export function isLowValueTokenBalance(balance: { totalValue: number; hasPrice?: boolean }) {
  if (balance.hasPrice === false) return false

  return formatUsdRate(balance.totalValue, 2) === '0.00'
}

export function formatBalanceNotionalValue(balance: { totalValue: number; hasPrice?: boolean }) {
  if (balance.hasPrice === false) return '—'
  if (isLowValueTokenBalance(balance)) return '<$0.01'

  return `$${formatUsdRate(balance.totalValue, 2)}`
}

export { toTokenId }
