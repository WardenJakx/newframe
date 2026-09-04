import { describe, expect, it } from 'bun:test'

import { parseOrigin } from './siteOrigin'

describe('parseOrigin', () => {
  it('keeps colons in the path out of the displayed domain', () => {
    expect(
      parseOrigin(
        'https://app.hyperliquid.xyz/trade/out:federal-reserves-open-market-committee-september-2026-rate-decision-increase-yes'
      )
    ).toStrictEqual({ protocol: 'https://', origin: 'app.hyperliquid.xyz' })
  })

  it('keeps ports in the displayed host', () => {
    expect(parseOrigin('http://localhost:3000/trade')).toStrictEqual({
      protocol: 'http://',
      origin: 'localhost:3000'
    })
  })
})
