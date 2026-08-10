import { describe, expect, it } from 'bun:test'

import { timestamp } from './timestamp'

describe('timestamp', () => {
  it('returns numeric timestamps unchanged', () => {
    expect(timestamp(1_700_000_000_000, 12)).toBe(1_700_000_000_000)
    expect(Number.isNaN(timestamp(Number.NaN, 12))).toBe(true)
  })

  it('returns valid and invalid Date timestamps unchanged', () => {
    expect(timestamp(new Date('2026-08-09T12:34:56.789Z'), 12)).toBe(1_786_278_896_789)
    expect(Number.isNaN(timestamp(new Date('invalid'), 12))).toBe(true)
  })

  it('parses date strings before considering numeric conversion', () => {
    const value = '2026-08-09T12:34:56.789Z'

    expect(timestamp(value, 12)).toBe(Date.parse(value))
  })

  it('converts numeric strings that are not parseable dates', () => {
    expect(timestamp('1700000000000', 12)).toBe(1_700_000_000_000)
  })

  it('returns the fallback for invalid strings and other values', () => {
    expect(timestamp('not a timestamp', 34)).toBe(34)
    expect(timestamp({ value: 12 }, 56)).toBe(56)
    expect(timestamp(null, 78)).toBe(78)
  })
})
