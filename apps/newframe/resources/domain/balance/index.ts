import { NATIVE_CURRENCY } from '../../constants'
import { formatUnits, toBigInt } from '../../utils/numbers'

import type { WithTokenId, Balance, Rate } from '../../../main/store/state'

interface DisplayedBalance extends Balance {
  displayBalance: string
  price: string
  priceChange: string | false
  usdRate: Rate
  hasPrice: boolean
  totalValue: number
  displayValue: string
}

const UNKNOWN = '?'
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

export function createBalance(rawBalance: Balance, quote?: Rate): DisplayedBalance {
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

export function isNativeCurrency(address: string) {
  return address === NATIVE_CURRENCY
}

export function getNativeCurrencyIcon(nativeCurrency: { icon?: string; symbol?: string }) {
  return nativeCurrency.icon || (nativeCurrency.symbol?.toUpperCase() === 'ETH' ? MAINNET_ETH_ICON : '')
}

export function isLowValueTokenBalance(balance: { totalValue: number; hasPrice?: boolean }) {
  if (balance.hasPrice === false) return false

  return formatUsdRate(balance.totalValue, 2) === '0.00'
}

export function toTokenId(token: WithTokenId) {
  const { chainId, address } = token
  return `${chainId}:${address.toLowerCase()}`
}
