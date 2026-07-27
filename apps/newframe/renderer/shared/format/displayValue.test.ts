import { describe, expect, it } from 'bun:test'

import { displayValueData } from './displayValue'

describe('displayValueData', () => {
  it('formats atomic wei and gwei representations', () => {
    const cases = [
      [displayValueData(356).wei(), { displayValue: '356', value: 356n }],
      [displayValueData(0).wei(), { displayValue: '0', value: 0n }],
      [displayValueData(356e9).gwei(), { displayValue: '356', value: 356 }],
      [displayValueData(356e-18).gwei(), { displayValue: '0', value: 0 }],
      [displayValueData(0).gwei(), { displayValue: '0', value: 0 }]
    ]

    for (const [actual, expected] of cases) expect(actual).toStrictEqual(expected)
  })

  it('does not expose a fiat amount without a usable production rate', () => {
    const cases = [
      displayValueData(356e24).fiat(),
      displayValueData(356e24, { currencyRate: { price: 1.3 }, isTestnet: true }).fiat()
    ]

    for (const actual of cases) expect(actual).toStrictEqual({ displayValue: '?', value: 0 })
  })

  it('formats fiat values with fixed cents and lower-bound approximation', () => {
    const cases = [
      [
        displayValueData(356e12, { currencyRate: { price: 1 } }).fiat(),
        { approximationSymbol: '<', displayValue: '0.01', value: 0.000356 }
      ],
      [
        displayValueData(999999e15, { currencyRate: { price: 1 } }).fiat(),
        { displayValue: '999.99', value: 999.999 }
      ],
      [displayValueData(0, { currencyRate: { price: 1.3 } }).fiat(), { displayValue: '0.00', value: 0 }]
    ]

    for (const [actual, expected] of cases) expect(actual).toStrictEqual(expected)
  })

  it('formats fiat and ether values without decimals when requested', () => {
    const cases = [
      [
        displayValueData(356e12, { currencyRate: { price: 1 } }).fiat({
          displayDecimals: false
        }),
        { approximationSymbol: '<', displayValue: '1', value: 0.000356 }
      ],
      [
        displayValueData(999999e15, { currencyRate: { price: 1 } }).fiat({
          displayDecimals: false
        }),
        { displayValue: '999', value: 999.999 }
      ],
      [
        displayValueData(356e12).ether({ displayDecimals: false }),
        { approximationSymbol: '<', displayValue: '1', value: 0.000356 }
      ],
      [
        displayValueData(999999e15).ether({ displayDecimals: false }),
        { displayValue: '999', value: 999.999 }
      ],
      [displayValueData(0).ether({ displayDecimals: false }), { displayValue: '0', value: 0 }]
    ]

    for (const [actual, expected] of cases) expect(actual).toStrictEqual(expected)
  })

  it('adapts ether precision across whole and fractional equivalence classes', () => {
    const cases: Array<[number, object]> = [
      [356e8, { approximationSymbol: '<', displayValue: '0.000001', value: 3.56e-8 }],
      [998.5678111111e18, { displayValue: '998.567', value: 998.5678111111 }],
      [99.85678111111e18, { displayValue: '99.8567', value: 99.85678111111 }],
      [9.985678111111e18, { displayValue: '9.98567', value: 9.985678111111 }],
      [0.9985678111111e18, { displayValue: '0.998567', value: 0.9985678111111 }],
      [0.09985678111111e18, { displayValue: '0.099856', value: 0.09985678111111 }],
      [0.009985678111111e18, { displayValue: '0.009985', value: 0.009985678111111 }],
      [0.0009985678111111e18, { displayValue: '0.000998', value: 0.0009985678111111 }],
      [0.00009985678111111e18, { displayValue: '0.000099', value: 0.00009985678111111 }],
      [0.000009985678111111e18, { displayValue: '0.000009', value: 0.000009985678111111 }],
      [0, { displayValue: '0', value: 0 }]
    ]

    for (const [source, expected] of cases) {
      expect(displayValueData(source).ether() as unknown).toStrictEqual(expected)
    }
  })

  it('selects the coherent shorthand unit and floors to two decimals', () => {
    const units = [
      { source: 35.6253e24, fullName: 'million', shortName: 'M', value: 35_625_300 },
      { source: 35.6253e27, fullName: 'billion', shortName: 'B', value: 35_625_300_000 },
      {
        source: 35.6253e30,
        fullName: 'trillion',
        shortName: 'T',
        value: 35_625_300_000_000
      },
      { source: 35.6253e33, fullName: 'quadrillion', shortName: 'Q', value: 3.56253e16 }
    ]

    for (const { source, fullName, shortName, value } of units) {
      const expected = {
        displayUnit: { fullName, shortName },
        displayValue: '35.62',
        value
      }

      expect(displayValueData(source).ether()).toStrictEqual(expected)
      expect(displayValueData(source, { currencyRate: { price: 1 } }).fiat()).toStrictEqual(expected)
    }
  })

  it('keeps exact shorthand values and floors rather than rounding up', () => {
    const cases = [
      [35e24, '35', 35_000_000],
      [35.6259e24, '35.62', 35_625_900]
    ] as const

    for (const [source, displayValue, value] of cases) {
      const expected = {
        displayUnit: { fullName: 'million', shortName: 'M' },
        displayValue,
        value
      }

      expect(displayValueData(source).ether()).toStrictEqual(expected)
      expect(displayValueData(source, { currencyRate: { price: 1 } }).fiat()).toStrictEqual(expected)
    }
  })

  it('caps values beyond the supported shorthand range', () => {
    const expected = {
      approximationSymbol: '>',
      displayUnit: { fullName: 'quadrillion', shortName: 'Q' },
      displayValue: '999,999',
      value: 3.56e34
    }

    expect(displayValueData(356e50).ether()).toStrictEqual(expected)
    expect(displayValueData(356e50, { currencyRate: { price: 1 } }).fiat()).toStrictEqual(expected)
  })
})
