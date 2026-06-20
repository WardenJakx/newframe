import { MAX_HEX } from '../constants'

export const max = BigInt(MAX_HEX)

const numberRegex = /\.0+$|(\.[0-9]*[1-9])0+$/
const decimalRegex = /^(-?)(\d*)(?:\.(\d*))?(?:[eE]([+-]?\d+))?$/

const digitsLookup = [
  { value: 1, symbol: '' },
  { value: 1e6, symbol: 'million' },
  { value: 1e9, symbol: 'billion' },
  { value: 1e12, symbol: 'trillion' },
  { value: 1e15, symbol: 'quadrillion' },
  { value: 1e18, symbol: 'quintillion' }
]

// parses a decimal value (plain, fractional or exponent notation) into an integer
// scaled by the given number of decimals, truncating any excess fractional digits
// e.g. parseUnits('1.5', 9) === 1500000000n
export function parseUnits(
  value: string | number | bigint | undefined | null,
  decimals = 0
): bigint | undefined {
  if (value === undefined || value === null) return undefined
  if (typeof value === 'bigint') return value * 10n ** BigInt(decimals)

  const str = typeof value === 'number' ? String(value) : value.trim()

  if (str.startsWith('0x')) {
    try {
      return BigInt(str) * 10n ** BigInt(decimals)
    } catch (e) {
      return undefined
    }
  }

  const match = str.match(decimalRegex)
  if (!match || (!match[2] && !match[3])) return undefined

  const [, sign, int = '', frac = '', exp = '0'] = match
  const digits = `${int}${frac}`
  const shift = parseInt(exp) + decimals - frac.length

  const scaled = shift >= 0 ? BigInt(digits) * 10n ** BigInt(shift) : BigInt(digits.slice(0, shift) || '0') // truncate digits beyond the requested precision

  return sign === '-' ? -scaled : scaled
}

// parses a hex, decimal or numeric value into a bigint, truncating any fractional part
export function toBigInt(value: string | number | bigint | undefined | null): bigint | undefined {
  return parseUnits(value, 0)
}

// formats an integer scaled by the given number of decimals as a plain decimal
// string with no trailing zeros, e.g. formatUnits(1500000000n, 9) === '1.5'
export function formatUnits(value: bigint, decimals = 0): string {
  const negative = value < 0n
  const digits = (negative ? -value : value).toString().padStart(decimals + 1, '0')
  const int = digits.slice(0, digits.length - decimals)
  const frac = decimals ? digits.slice(-decimals).replace(/0+$/, '') : ''

  return `${negative ? '-' : ''}${int}${frac ? `.${frac}` : ''}`
}

function formatNumber(n: number, digits = 4) {
  const num = Number(n)
  const item = digitsLookup
    .slice()
    .reverse()
    .find((item) => num >= item.value) || { value: 0, symbol: '?' }

  const formatted = (value: number) => {
    const isAproximate = value.toFixed(digits) !== value.toString(10)
    const prefix = isAproximate ? '~' : ''
    return `${prefix}${value.toFixed(digits).replace(numberRegex, '$1')} ${item.symbol}`
  }

  return item ? formatted(num / item.value) : '0'
}

export function isUnlimited(amount: string) {
  return toBigInt(amount) === max
}

export function formatDisplayDecimal(amount: string | number, decimals: number) {
  const value = Number(formatUnits(toBigInt(amount) ?? 0n, decimals))

  if (value > 9e12) return decimals ? '~unlimited' : 'unknown'

  return formatNumber(value)
}
