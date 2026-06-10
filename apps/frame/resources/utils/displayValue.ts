import { formatUnits, parseUnits, toBigInt } from './numbers'

import type { Rate } from '../../main/store/state'

const displayUnitMapping = [
  { fullName: 'million', shortName: 'M', magnitude: 6 },
  { fullName: 'billion', shortName: 'B', magnitude: 9 },
  { fullName: 'trillion', shortName: 'T', magnitude: 12 },
  { fullName: 'quadrillion', shortName: 'Q', magnitude: 15 }
]

// the upper bound of values displayed in shorthand, anything above this is shown as "> 999,999 Q"
const maxDisplayValue = 999999n * 10n ** 15n

function withCommas(int: string) {
  return int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

// formats a value scaled by `scale` decimals, floored to `dp` decimal places
// fixed decimals pads fiat values to exactly `dp` places, e.g. "999.99", "0.00"
function formatScaled(value: bigint, scale: number, dp: number, fixedDecimals: boolean) {
  const floored = scale >= dp ? value / 10n ** BigInt(scale - dp) : value * 10n ** BigInt(dp - scale)
  const digits = floored.toString().padStart(dp + 1, '0')
  const int = withCommas(digits.slice(0, digits.length - dp))
  const frac = dp ? (fixedDecimals ? digits.slice(-dp) : digits.slice(-dp).replace(/0+$/, '')) : ''

  return frac ? `${int}.${frac}` : int
}

function getDisplay(value: bigint, scale: number, type: string, dp: number, displayFullValue?: boolean) {
  const isFiat = type === 'fiat'

  // zero
  if (value === 0n) {
    return {
      displayValue: isFiat ? formatScaled(0n, 0, dp, true) : '0'
    }
  }

  // minimum display value
  const floored = scale >= dp ? value / 10n ** BigInt(scale - dp) : value
  if (floored === 0n) {
    return {
      approximationSymbol: '<',
      displayValue: dp ? `0.${'1'.padStart(dp, '0')}` : '1'
    }
  }

  // small numbers
  if (displayFullValue || value < 10n ** BigInt(6 + scale)) {
    return {
      displayValue: formatScaled(value, scale, dp, isFiat)
    }
  }

  // shorthand display of large numbers
  for (const { fullName, shortName, magnitude } of displayUnitMapping) {
    const lowerBound = 10n ** BigInt(magnitude + scale)
    const upperBound =
      magnitude === 15 ? maxDisplayValue * 10n ** BigInt(scale) : 10n ** BigInt(magnitude + 3 + scale)

    if (value >= lowerBound && value < upperBound) {
      return {
        displayValue: formatScaled(value, scale + magnitude, 2, false),
        displayUnit: { fullName, shortName }
      }
    }
  }

  // maximum display value
  return {
    approximationSymbol: '>',
    displayValue: '999,999',
    displayUnit: { fullName: 'quadrillion', shortName: 'Q' }
  }
}

type DisplayValueDataParams = {
  currencyRate?: Rate
  displayFullValue?: boolean
  decimals: number
  isTestnet: boolean
}

type SourceValue = string | number | bigint
type DisplayUnit = {
  fullName: string
  shortName: string
}
export type DisplayValueData = {
  fiat: () => {
    value: number
    displayValue: string
    approximationSymbol?: string
    displayUnit?: DisplayUnit
  }
  ether: () => {
    value: number
    displayValue: string
    approximationSymbol?: string
    displayUnit?: DisplayUnit
  }
  gwei: () => {
    value: number
    displayValue: string
  }
  wei: () => {
    value: bigint | undefined
    displayValue: string
  }
  bn: bigint | undefined
}

export function displayValueData(
  sourceValue: SourceValue,
  params?: DisplayValueDataParams
): DisplayValueData {
  const {
    currencyRate,
    decimals = 18,
    isTestnet = false,
    displayFullValue = false
  } = (params || {}) as DisplayValueDataParams

  const bn = sourceValue === undefined || sourceValue === null ? undefined : toBigInt(sourceValue)

  const currencyHelperMap = {
    fiat: ({ displayDecimals } = { displayDecimals: true }) => {
      const displayedDecimals = displayDecimals ? 2 : 0

      if (isTestnet || !currencyRate || bn === undefined) {
        return {
          value: bn === undefined ? NaN : 0,
          displayValue: '?'
        }
      }

      // scale the rate to an integer to keep the math exact
      const rate = parseUnits(currencyRate.price, 18)

      if (rate === undefined) {
        return {
          value: NaN,
          displayValue: '?'
        }
      }

      const value = bn * rate
      const scale = decimals + 18

      return {
        value: Number(formatUnits(value, scale)),
        ...getDisplay(value, scale, 'fiat', displayedDecimals, displayFullValue)
      }
    },
    ether: ({ displayDecimals } = { displayDecimals: true }) => {
      if (bn === undefined) {
        return {
          value: NaN,
          displayValue: '?'
        }
      }

      const getDisplayedDecimals = () => {
        if (!displayDecimals) return 0

        const numNonDecimals = (bn / 10n ** BigInt(decimals)).toString().replace('-', '').length
        const isFraction = bn / 10n ** BigInt(decimals) === 0n

        return Math.max(0, 6 - (isFraction ? 0 : numNonDecimals))
      }

      return {
        value: Number(formatUnits(bn, decimals)),
        ...getDisplay(bn, decimals, 'ether', getDisplayedDecimals(), displayFullValue)
      }
    },
    gwei: () => {
      if (bn === undefined) {
        return {
          value: NaN,
          displayValue: '?'
        }
      }

      // floor to 2 decimal places
      const hundredths = bn / 10n ** 7n

      return {
        value: Number(hundredths) / 100,
        displayValue: hundredths === 0n ? '0' : formatScaled(hundredths, 2, 2, false)
      }
    },
    wei: () => ({
      value: bn,
      displayValue: bn === undefined ? '?' : withCommas(bn.toString())
    })
  }

  return {
    bn,
    ...currencyHelperMap
  }
}
