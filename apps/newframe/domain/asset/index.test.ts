import { describe, expect, it } from 'bun:test'

import {
  getAssetRateKey,
  getAssetLabel,
  getCuratedAsset,
  listCuratedAssets,
  listCuratedTokenAssets,
  resolveAssetRate,
  toAssetId,
  toErc20AssetId,
  toNativeAssetId
} from '.'
import { NATIVE_CURRENCY } from '../token/constants'

const expectedGroups = {
  ETH: [
    [1, '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'],
    [10, '0x4200000000000000000000000000000000000006'],
    [8453, '0x4200000000000000000000000000000000000006'],
    [81457, '0x4300000000000000000000000000000000000004'],
    [42161, '0x82af49447d8a07e3bd95bd0d56f35241523fbab1']
  ],
  USDC: [
    [1, '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48'],
    [10, '0x0b2c639c533813f4aa9d7837caf62653d097ff85'],
    [137, '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359'],
    [999, '0xb88339cb7199b77e23db6e890353e22632ba630f'],
    [8453, '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'],
    [42161, '0xaf88d065e77c8cc2239327c5edb3a432268e5831'],
    [43114, '0xb97ef9ef8734c71904d8002f8b6bc66dd9c48a6e'],
    [143, '0x754704bc059f8c67012fed69bc8a327a5aafb603']
  ],
  USDT: [
    [1, '0xdac17f958d2ee523a2206206994597c13d831ec7'],
    [43114, '0x9702230a8ea53601f5cd2dc00fdbc13d4df4a8c7']
  ],
  USDT0: [
    [10, '0x01bff41798a0bcf287b996046ca68b395dbc1071'],
    [999, '0xb8ce59fc3717ada4c02eadf9682a9e934f625ebb'],
    [9745, '0xb8ce59fc3717ada4c02eadf9682a9e934f625ebb'],
    [143, '0xe7cd86e13ac4309349f30b3435a9d337750fc82d']
  ],
  WBTC: [
    [1, '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599'],
    [56, '0x39665e85a68a4d7328b8799135e2ff301a0ca86f'],
    [8453, '0x1cea84203673764244e05693e42e6ace62be9ba5']
  ],
  cbBTC: [
    [1, '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf'],
    [8453, '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf'],
    [42161, '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf']
  ]
} as const

describe('curated asset registry', () => {
  it('contains exactly the approved normalized and unique ERC-20 representations', () => {
    const assets = listCuratedAssets()
    const expected = Object.entries(expectedGroups)
      .flatMap(([commonAsset, entries]) =>
        entries.map(([chainId, address]) => ({
          assetId: `${chainId}:${address}`,
          chainId,
          address,
          commonAsset
        }))
      )
      .sort((left, right) => left.assetId.localeCompare(right.assetId))
    const actual = assets
      .map(({ address, assetId, chainId, commonAsset }) => ({
        address,
        assetId,
        chainId,
        commonAsset
      }))
      .sort((left, right) => left.assetId.localeCompare(right.assetId))

    expect(actual).toStrictEqual(expected)
    expect(new Set(assets.map(({ assetId }) => assetId)).size).toBe(assets.length)
    expect(
      assets.every(({ address, assetId }) => address === address?.toLowerCase() && assetId.endsWith(address!))
    ).toBe(true)
    expect(listCuratedTokenAssets().map(({ assetId }) => assetId)).toStrictEqual(
      assets.map(({ assetId }) => assetId)
    )
    expect(Object.isFrozen(assets)).toBe(true)
    expect(assets.every(Object.isFrozen)).toBe(true)
  })

  it('applies the required labels, decimals, and stablecoin fixed-rate policy', () => {
    const assets = listCuratedAssets()

    expect(assets.every(({ assetLabel }) => assetLabel === 'stablecoin' || assetLabel === 'token')).toBe(true)
    expect(
      assets
        .filter(({ commonAsset }) => ['USDC', 'USDT', 'USDT0'].includes(commonAsset))
        .every(({ assetLabel, decimals, fixedUsdRate }) => {
          return assetLabel === 'stablecoin' && decimals === 6 && fixedUsdRate === 1
        })
    ).toBe(true)
    expect(
      assets
        .filter(({ commonAsset }) => ['WBTC', 'cbBTC'].includes(commonAsset))
        .every(({ assetLabel, decimals, fixedUsdRate }) => {
          return assetLabel === 'token' && decimals === 8 && fixedUsdRate === undefined
        })
    ).toBe(true)
    expect(
      assets
        .filter(({ commonAsset }) => commonAsset === 'ETH')
        .every(({ assetLabel, decimals, fixedUsdRate }) => {
          return assetLabel === 'token' && decimals === 18 && fixedUsdRate === undefined
        })
    ).toBe(true)
  })

  it('builds normalized identities and performs exact registry lookup', () => {
    const wethId = toErc20AssetId(1, '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2')

    expect(wethId).toBe('1:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2')
    expect(toNativeAssetId(999_999, 'eth')).toBe('999999:ETH')
    expect(getCuratedAsset(wethId)?.commonAsset).toBe('ETH')
    expect(getCuratedAsset('1:0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2')?.commonAsset).toBe('ETH')
    expect(getCuratedAsset('1:0x0000000000000000000000000000000000000001')).toBeUndefined()
  })

  it('uses only canonical native ETH and approved curated relationships as shared rate keys', () => {
    const unknownToken = '1:0x0000000000000000000000000000000000000001'

    expect(getAssetRateKey(toNativeAssetId(1, 'ETH'))).toBe('ETH')
    expect(getAssetRateKey(toNativeAssetId(999_999, 'ETH'))).toBe('ETH')
    expect(getAssetRateKey(toNativeAssetId(1, 'MATIC'))).toBe('1:MATIC')
    expect(getAssetRateKey('1:eth')).toBe('1:eth')
    expect(getAssetRateKey(expectedGroups.ETH[0].join(':'))).toBe('ETH')
    expect(getAssetRateKey(expectedGroups.WBTC[0].join(':'))).toBe('WBTC')
    expect(getAssetRateKey(expectedGroups.cbBTC[0].join(':'))).toBe('cbBTC')
    expect(getAssetRateKey(unknownToken)).toBe(unknownToken)
  })

  it('labels and resolves native, fixed, shared, and chain-specific references', () => {
    const native = { chainId: 999_999, address: NATIVE_CURRENCY, nativeTicker: 'eth' }
    const usdc = {
      chainId: 1,
      address: expectedGroups.USDC[0][1]
    }
    const unknownToken = {
      chainId: 1,
      address: '0x0000000000000000000000000000000000000001'
    }
    const variable = { usdRate: 2_000, source: 'zerion' as const, observedAt: 1 }

    expect(toAssetId(native)).toBe('999999:ETH')
    expect(getAssetLabel(native)).toBe('native')
    expect(getAssetLabel(usdc)).toBe('stablecoin')
    expect(getAssetLabel(unknownToken)).toBeUndefined()
    expect(getCuratedAsset(toAssetId(unknownToken)!)).toBeUndefined()
    expect(resolveAssetRate(native, { ETH: variable })).toBe(variable)
    expect(resolveAssetRate(usdc, {})).toEqual({ usdRate: 1, source: 'fixed' })
    expect(
      resolveAssetRate(unknownToken, {
        '1:0x0000000000000000000000000000000000000001': variable
      })
    ).toBe(variable)
  })
})
