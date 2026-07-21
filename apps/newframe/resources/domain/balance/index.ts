import { NATIVE_CURRENCY } from '../../constants'
import { formatUnits, toBigInt } from '../../utils/numbers'
import { tokenFromBalance, tokenImageSource, toTokenId } from '../token'

import type { Balance, Rate, TokenCatalog } from '../../../main/store/state'

export interface DisplayedBalance extends Balance {
  decimals: number
  displayBalance: string
  logoURI?: string
  name: string
  price: string
  priceChange: string | false
  symbol: string
  usdRate: Rate
  hasPrice: boolean
  totalValue: number
  displayValue: string
}

export interface BalanceSummary extends Balance {
  decimals: number
  hasPrice: boolean
  logoURI?: string
  name: string
  quote?: Rate
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
  usd?: Rate
}

interface NetworkMetaLike {
  nativeCurrency?: NativeCurrencyInfo
}

type RateContainer = { usd?: Rate }
type NetworkMap = Record<string | number, ChainLike>
type NetworkMetaMap = Record<string | number, NetworkMetaLike>
type RateMap = Record<string, RateContainer>

interface BalanceSummaryOptions {
  rawBalances: BalanceInput[]
  rates?: RateMap
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
const EMPTY_RATES: RateMap = {}
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
  quote?: Rate
): DisplayedBalance {
  const balance = balanceValue(rawBalance)
  const hasPrice = typeof quote?.price === 'number' && !isNaN(quote.price)
  const usdRate = hasPrice ? quote.price : NaN
  const change24hr = (quote && quote['change24hr']) || 0

  const totalValue = balance * usdRate
  const balanceDecimals = hasPrice ? Math.max(2, Math.trunc(usdRate * 10).toString().length) : 8

  return {
    ...rawBalance,
    usdRate: quote as Rate,
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
  rates = {},
  networks = {},
  networksMeta = {},
  tokens = { byId: {}, accountTokenIds: {} }
}: {
  rawBalance: BalanceInput
  rates?: RateMap
  networks?: NetworkMap
  networksMeta?: NetworkMetaMap
  tokens?: TokenCatalog
}): BalanceSummary {
  const chain = networks[rawBalance.chainId] || {}
  const isNative = isNativeCurrency(rawBalance.address)
  const nativeCurrencyInfo = networksMeta[rawBalance.chainId]?.nativeCurrency || {}
  const token = tokenFromBalance(tokens, rawBalance, nativeCurrencyInfo)
  const rate = isNative ? nativeCurrencyInfo : rates[rawBalance.address || rawBalance.symbol || ''] || {}
  const decimals = token?.decimals ?? rawBalance.decimals ?? 18
  const quote = chain.isTestnet ? { price: 0, change24hr: 0 } : rate.usd
  const hasPrice = typeof quote?.price === 'number' && !isNaN(quote.price)
  const unformattedBalance = balanceValue({ balance: rawBalance.balance, decimals })
  const totalValue = hasPrice ? unformattedBalance * quote.price : 0

  return {
    ...rawBalance,
    address: rawBalance.address,
    balance: rawBalance.balance,
    chainId: rawBalance.chainId,
    decimals,
    displayBalance: rawBalance.displayBalance || '',
    hasPrice,
    logoURI:
      tokenImageSource(token) ||
      (isNative && getNativeCurrencyIcon(nativeCurrencyInfo)) ||
      token?.logoURI ||
      rawBalance.logoURI,
    name: token?.name || (isNative ? chain.name || '' : rawBalance.name || ''),
    quote,
    symbol: token?.symbol || rawBalance.symbol || '',
    totalValue: isNaN(totalValue) ? 0 : totalValue,
    unformattedBalance
  }
}

export function createBalanceSummaries({
  rawBalances,
  rates = EMPTY_RATES,
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
    .map((rawBalance) => createBalanceSummary({ rawBalance, rates, networks, networksMeta, tokens }))
    .sort(sortBalanceSummariesByTotalValue)
}

export function createBalanceSummarySelector() {
  let cache: {
    cacheKey: unknown
    rawBalances: unknown
    rates: unknown
    tokens: unknown
    networks: unknown
    networksMeta: unknown
    balances: BalanceSummary[]
  } | null = null

  return ({
    rawBalances,
    rates = EMPTY_RATES,
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
      cache.rates === rates &&
      cache.tokens === tokens &&
      cache.networks === networks &&
      cache.networksMeta === networksMeta
    ) {
      return cache.balances
    }

    const balances = createBalanceSummaries({
      rawBalances,
      rates,
      networks,
      networksMeta,
      tokens,
      includeChain,
      includeBalance
    })

    cache = {
      cacheKey,
      rawBalances,
      rates,
      tokens,
      networks,
      networksMeta,
      balances
    }

    return balances
  }
}

export function createDisplayBalance(balance: BalanceSummary): DisplayedBalance {
  const { quote, unformattedBalance, ...rawBalance } = balance

  return createBalance(rawBalance, quote)
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

function getNativeCurrencyIcon(nativeCurrency: { icon?: string; symbol?: string }) {
  return nativeCurrency.icon || (nativeCurrency.symbol?.toUpperCase() === 'ETH' ? MAINNET_ETH_ICON : '')
}

export function isLowValueTokenBalance(balance: { totalValue: number; hasPrice?: boolean }) {
  if (balance.hasPrice === false) return false

  return formatUsdRate(balance.totalValue, 2) === '0.00'
}

export function formatBalanceNotionalValue(balance: { totalValue: number; hasPrice?: boolean }) {
  if (balance.hasPrice === false) return '$0'
  if (isLowValueTokenBalance(balance)) return '<$0.01'

  return `$${formatUsdRate(balance.totalValue, 2)}`
}

export { toTokenId }
