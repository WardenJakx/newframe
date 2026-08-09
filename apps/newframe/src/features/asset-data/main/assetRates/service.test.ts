import { describe, expect, it, mock } from 'bun:test'

import { NATIVE_CURRENCY } from '../../../tokens/domain/constants'
import { createTestStore } from '../../../../../test/support/createTestStore'
import { createAssetRateService } from './service'

const WETH_MAINNET = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'
const WETH_BASE = '0x4200000000000000000000000000000000000006'
const USDC_MAINNET = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'
const UNKNOWN = '0x0000000000000000000000000000000000000001'

function setup() {
  const store = createTestStore({
    main: {
      networksMeta: {
        ethereum: {
          1: { nativeCurrency: { symbol: 'ETH' } },
          137: { nativeCurrency: { symbol: 'MATIC' } }
        }
      }
    }
  })
  const now = mock(() => 100)
  return { store, service: createAssetRateService({ store, clock: { now } }), now }
}

describe('asset rate service', () => {
  it('shares curated variable rates and returns fixed rates without storing observations', () => {
    const { service, store } = setup()

    service.observe('zerion', [
      { chainId: 1, address: WETH_MAINNET, usdRate: 2_000, change24hr: 3 },
      { chainId: 1, address: USDC_MAINNET, usdRate: 0.9 }
    ])

    expect(service.get({ chainId: 8453, address: WETH_BASE })).toMatchObject({
      usdRate: 2_000,
      change24hr: 3,
      source: 'zerion'
    })
    expect(service.get({ chainId: 1, address: USDC_MAINNET })).toEqual({
      usdRate: 1,
      source: 'fixed'
    })
    expect(store.getState().main.assetRates).toEqual({
      ETH: { usdRate: 2_000, change24hr: 3, source: 'zerion', observedAt: 100 }
    })
  })

  it('normalizes native metadata and ignores invalid or older observations', () => {
    const { service, store } = setup()

    service.observe('zerion', [
      { chainId: 1, address: NATIVE_CURRENCY, usdRate: 2_100, observedAt: 20 },
      { chainId: 1, address: NATIVE_CURRENCY, usdRate: 2_000, observedAt: 19 },
      { chainId: 1, address: UNKNOWN, usdRate: Number.NaN },
      { chainId: 1, address: UNKNOWN, usdRate: 0 },
      { chainId: 1, address: UNKNOWN, usdRate: 4, change24hr: Number.POSITIVE_INFINITY }
    ])

    expect(service.get({ chainId: 1, address: NATIVE_CURRENCY })?.usdRate).toBe(2_100)
    expect(store.getState().main.assetRates).toEqual({
      ETH: { usdRate: 2_100, source: 'zerion', observedAt: 20 }
    })
  })

  it('keeps non-ETH native rates chain-specific and accepts an empty batch', () => {
    const { service, store } = setup()

    service.observe('zerion', [])
    service.observe('zerion', [
      { chainId: 137, address: NATIVE_CURRENCY, nativeTicker: 'MATIC', usdRate: 1.25 }
    ])

    expect(service.get({ chainId: 137, address: NATIVE_CURRENCY, nativeTicker: 'MATIC' })?.usdRate).toBe(1.25)
    expect(store.getState().main.assetRates['137:MATIC']).toBeDefined()
  })
})
