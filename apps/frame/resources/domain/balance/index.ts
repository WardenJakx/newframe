import { NATIVE_CURRENCY } from '../../constants'
import { formatUnits, toBigInt } from '../../utils/numbers'

import type { WithTokenId, Balance, Rate } from '../../../main/store/state'

interface DisplayedBalance extends Balance {
  displayBalance: string
  price: string
  priceChange: string | false
  usdRate: Rate
  totalValue: number
  displayValue: string
}

const UNKNOWN = '?'

function floorTo(value: number, decimals: number) {
  const scale = 10 ** decimals
  return Math.floor(value * scale) / scale
}

function balanceValue({ balance, decimals }: { balance?: string; decimals: number }) {
  return Number(formatUnits(toBigInt(balance || 0) ?? 0n, decimals))
}

export function formatBalance(balance: number, totalValue: number, decimals = 8) {
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
  const usdRate = (quote && quote.price) ?? NaN
  const change24hr = (quote && quote['change24hr']) || 0

  const totalValue = balance * usdRate
  const balanceDecimals = Math.max(2, Math.trunc(usdRate * 10).toString().length)

  return {
    ...rawBalance,
    usdRate: quote as Rate,
    displayBalance: formatBalance(balance, totalValue, balanceDecimals),
    price: formatUsdRate(usdRate),
    priceChange: usdRate !== 0 && !isNaN(usdRate) && change24hr.toFixed(2),
    totalValue: isNaN(totalValue) ? 0 : totalValue,
    displayValue: totalValue === 0 ? '0' : formatUsdRate(totalValue, 0)
  }
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

export function toTokenId(token: WithTokenId) {
  const { chainId, address } = token
  return `${chainId}:${address.toLowerCase()}`
}
