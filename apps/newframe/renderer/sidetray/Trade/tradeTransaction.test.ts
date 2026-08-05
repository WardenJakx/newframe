import { describe, expect, it } from 'bun:test'

import type { BalanceSummary } from '../../../domain/balance'
import { FLASH_USDC_ASSET, FLASH_WETH_ASSET } from '../../../domain/flash/assets'
import {
  FLASH_LIMIT_ORDER_TYPE,
  FLASH_MARKET_ORDER_TYPE,
  FLASH_NATIVE_ETH_TOKEN_ADDRESS,
  FLASH_STOP_LOSS_ORDER_TYPE,
  FLASH_STOP_ORDER_TYPE,
  FLASH_TAKE_PROFIT_ORDER_TYPE,
  FLASH_TWAP_ORDER_TYPE
} from '../../../domain/flash/constants'
import type { FlashQuote } from '../../../domain/flash/schemas'
import { cleanFlashDecimal } from '../../../domain/flash/policy'
import {
  buildTradeAssetOptions,
  buildTradeQuoteRequest,
  createTradeBalanceIndex,
  getEstimatedTradePriceImpact,
  getTradeDurationSeconds,
  getTradeAssetKey,
  getTradeQuoteValidationError,
  getTradeValidationError,
  marketTradeQuoteRequestKey
} from './tradeTransaction'

describe('tradeTransaction', () => {
  const base = {
    accountAddress: '0xsender',
    contraAsset: FLASH_USDC_ASSET,
    inputAmount: '1',
    quickTrade: false,
    side: 'sell' as const,
    slippage: '',
    targetAsset: FLASH_WETH_ASSET
  }
  const validate = (fields: Record<string, unknown>) =>
    getTradeValidationError({ inputAmount: '1', side: 'sell', ...fields } as any)
  const market = (fields: Record<string, unknown> = {}) =>
    buildTradeQuoteRequest({ ...base, ...fields, orderType: FLASH_MARKET_ORDER_TYPE } as any)

  it('normalizes market and optional order payloads', () => {
    expect(cleanFlashDecimal(' 1,200.50 ')).toBe('1200.50')
    expect(market({ inputAmount: ' 1,200.50 ' })).toEqual({
      accountAddress: '0xsender',
      contraAsset: FLASH_USDC_ASSET,
      inputAmount: '1200.50',
      orderType: FLASH_MARKET_ORDER_TYPE,
      qty: '1200.50',
      side: 'sell',
      targetAsset: FLASH_WETH_ASSET
    })
    expect(market({ quickTrade: true, slippage: '1.00' })).toMatchObject({
      quickTrade: true,
      slippage: '1.00'
    })

    const requests = [
      [
        {
          expireTime: '2099-01-02T03:04:00.000Z',
          limitNotionalPrice: '2,500',
          orderType: FLASH_LIMIT_ORDER_TYPE,
          timeInForce: 'gtt'
        },
        { expireTime: '2099-01-02T03:04:00.000Z', limitNotionalPrice: '2500' }
      ],
      [
        { limitNotionalPrice: '2490', orderType: FLASH_TAKE_PROFIT_ORDER_TYPE, triggerNotionalPrice: '2500' },
        { limitNotionalPrice: '2490', triggers: [{ notionalPrice: '2500', triggerType: 'upper' }] }
      ],
      [
        { orderType: FLASH_STOP_LOSS_ORDER_TYPE, triggerNotionalPrice: '2100' },
        { triggers: [{ notionalPrice: '2100', triggerType: 'lower' }] }
      ],
      [
        {
          limitNotionalPrice: '2610',
          orderType: FLASH_STOP_ORDER_TYPE,
          side: 'buy',
          triggerNotionalPrice: '2600'
        },
        { side: 'buy', triggers: [{ notionalPrice: '2600', triggerType: 'upper' }] }
      ],
      [
        {
          durationDays: '1',
          durationHours: '2',
          durationMinutes: '3',
          limitNotionalPrice: '2,300',
          maxPriceImpact: '4.5',
          orderType: FLASH_TWAP_ORDER_TYPE,
          startTime: '2099-01-02T03:04:00.000Z',
          twapBucketCount: '12'
        },
        { durationSeconds: 93_780, limitNotionalPrice: '2300', maxPriceImpact: '4.5', twapBucketCount: 12 }
      ]
    ] as const
    for (const [input, expected] of requests)
      expect(buildTradeQuoteRequest({ ...base, ...input })).toMatchObject(expected)
    expect(
      buildTradeQuoteRequest({
        ...base,
        durationDays: '0',
        durationHours: '1',
        durationMinutes: '0',
        maxPriceImpact: '',
        orderType: FLASH_TWAP_ORDER_TYPE,
        twapBucketCount: ''
      })
    ).not.toHaveProperty('twapBucketCount')
  })

  it('table-drives distinct ticket policy branches and bounds', () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ inputAmount: '', orderType: FLASH_MARKET_ORDER_TYPE }, 'Enter an amount to trade.'],
      [{ orderType: FLASH_LIMIT_ORDER_TYPE }, 'Enter a limit price.'],
      [
        { durationDays: '0', durationHours: '0', durationMinutes: '4', orderType: FLASH_TWAP_ORDER_TYPE },
        'TWAP duration must be between 5 minutes and 30 days.'
      ],
      [
        {
          durationDays: '0',
          durationHours: '1',
          durationMinutes: '0',
          maxPriceImpact: '101',
          orderType: FLASH_TWAP_ORDER_TYPE
        },
        'Max price impact must be between 0% and 100%.'
      ],
      [
        {
          durationDays: '0',
          durationHours: '1',
          durationMinutes: '0',
          limitNotionalPrice: 'bad',
          orderType: FLASH_TWAP_ORDER_TYPE
        },
        'Enter a valid TWAP limit price or leave it blank for market execution.'
      ],
      [
        {
          durationDays: '0',
          durationHours: '1',
          durationMinutes: '0',
          orderType: FLASH_TWAP_ORDER_TYPE,
          startTime: '2000-01-01T00:00:00.000Z'
        },
        'Choose a future TWAP start time or leave it blank to start immediately.'
      ],
      [{ orderType: FLASH_MARKET_ORDER_TYPE, slippage: 'bad' }, 'Max slippage must be between 0% and 100%.'],
      [
        {
          limitNotionalPrice: 'bad',
          orderType: FLASH_STOP_ORDER_TYPE,
          side: 'buy',
          triggerNotionalPrice: '2500'
        },
        'Enter a valid limit price or leave it blank for a market order.'
      ],
      [
        { orderType: FLASH_STOP_ORDER_TYPE, triggerNotionalPrice: '2500' },
        'Stop orders must buy the target asset.'
      ],
      [
        { orderType: FLASH_TAKE_PROFIT_ORDER_TYPE, side: 'buy', triggerNotionalPrice: '2500' },
        'TP/SL orders must sell the target asset.'
      ]
    ]
    for (const [fields, error] of cases) expect(validate(fields)).toBe(error)
    expect(validate({ orderType: FLASH_MARKET_ORDER_TYPE })).toBe('')
    expect(
      validate({
        durationDays: '0',
        durationHours: '1',
        durationMinutes: '0',
        orderType: FLASH_TWAP_ORDER_TYPE
      })
    ).toBe('')
    expect(getTradeDurationSeconds({ durationDays: '1', durationHours: '2', durationMinutes: '3' })).toBe(
      93_780
    )
  })

  it('validates quote-relative triggers and estimates impact', () => {
    const quote = {
      side: 'sell',
      orderType: FLASH_MARKET_ORDER_TYPE,
      targetAsset: FLASH_WETH_ASSET,
      contraAsset: FLASH_USDC_ASSET,
      spentAsset: FLASH_WETH_ASSET,
      receiveAsset: FLASH_USDC_ASSET,
      inputAmount: '1',
      outputAmount: '2388',
      inputNotional: '2400',
      outputNotional: '2388',
      targetNotionalPrice: '2400',
      steps: []
    } satisfies FlashQuote
    expect(getEstimatedTradePriceImpact(quote)).toBeCloseTo(0.5)
    const error = (
      orderType:
        | typeof FLASH_STOP_ORDER_TYPE
        | typeof FLASH_STOP_LOSS_ORDER_TYPE
        | typeof FLASH_TAKE_PROFIT_ORDER_TYPE,
      triggerNotionalPrice: string
    ) => getTradeQuoteValidationError({ orderType, quote, triggerNotionalPrice })
    expect(error(FLASH_TAKE_PROFIT_ORDER_TYPE, '2300')).toContain('above')
    expect(error(FLASH_STOP_LOSS_ORDER_TYPE, '2500')).toContain('below')
    expect(error(FLASH_STOP_ORDER_TYPE, '2500')).toBe('')
  })

  it('keys every execution-affecting request dimension', () => {
    const first = market()!
    const second = market({ accountAddress: '0xother', quickTrade: true, slippage: '1' })!
    expect(marketTradeQuoteRequestKey(first)).not.toBe(marketTradeQuoteRequestKey(second))
  })

  it('builds cross-chain Market intent without scalar chains and rejects advanced intent', () => {
    const baseTarget = { ...FLASH_WETH_ASSET, chainId: 8453, id: `8453:${FLASH_WETH_ASSET.address}` }
    const ethereumContra = { ...FLASH_USDC_ASSET, chainId: 1, id: `1:${FLASH_USDC_ASSET.address}` }
    const request = market({ targetAsset: baseTarget, contraAsset: ethereumContra })

    expect(request).toMatchObject({
      targetAsset: baseTarget,
      contraAsset: ethereumContra,
      orderType: FLASH_MARKET_ORDER_TYPE
    })
    expect(request).not.toHaveProperty('chainId')
    expect(request).not.toHaveProperty('targetChain')
    expect(request).not.toHaveProperty('contraChain')
    expect(
      buildTradeQuoteRequest({
        ...base,
        targetAsset: baseTarget,
        contraAsset: ethereumContra,
        limitNotionalPrice: '2500',
        orderType: FLASH_LIMIT_ORDER_TYPE
      })
    ).toBe(null)
    expect(
      getTradeValidationError({
        contraAsset: ethereumContra,
        inputAmount: '1',
        limitNotionalPrice: '2500',
        orderType: FLASH_LIMIT_ORDER_TYPE,
        side: 'sell',
        targetAsset: baseTarget
      })
    ).toBe('Cross-chain trades only support Market orders.')
    expect(
      getTradeValidationError({
        contraAsset: ethereumContra,
        inputAmount: '',
        orderType: FLASH_LIMIT_ORDER_TYPE,
        side: 'sell',
        targetAsset: baseTarget
      })
    ).toBe('Cross-chain trades only support Market orders.')
    expect(
      buildTradeQuoteRequest({
        ...base,
        targetAsset: baseTarget,
        contraAsset: ethereumContra,
        orderType: FLASH_MARKET_ORDER_TYPE
      })
    ).not.toBe(null)
  })

  it('keys quote and balance identity by each asset chain and canonical address', () => {
    const sharedId = 'shared-token'
    const ethereumTarget = { ...FLASH_WETH_ASSET, chainId: 1, id: sharedId }
    const baseTarget = { ...FLASH_WETH_ASSET, chainId: 8453, id: sharedId }
    const ethereumRequest = market({ targetAsset: ethereumTarget })!
    const baseRequest = market({ targetAsset: baseTarget })!
    const balances = [
      {
        address: FLASH_WETH_ASSET.address,
        balance: '100',
        chainId: 1,
        decimals: 18,
        displayBalance: '0.0000000000000001',
        hasPrice: false,
        name: 'Wrapped Ether',
        symbol: 'WETH',
        totalValue: 0,
        unformattedBalance: 0.0000000000000001
      },
      {
        address: FLASH_WETH_ASSET.address,
        balance: '200',
        chainId: 8453,
        decimals: 18,
        displayBalance: '0.0000000000000002',
        hasPrice: false,
        name: 'Wrapped Ether',
        symbol: 'WETH',
        totalValue: 0,
        unformattedBalance: 0.0000000000000002
      }
    ] satisfies BalanceSummary[]
    const index = createTradeBalanceIndex(balances)

    expect(marketTradeQuoteRequestKey(ethereumRequest)).not.toBe(marketTradeQuoteRequestKey(baseRequest))
    expect(getTradeAssetKey(ethereumTarget)).not.toBe(getTradeAssetKey(baseTarget))
    expect(index.get(getTradeAssetKey(ethereumTarget))?.balance).toBe('100')
    expect(index.get(getTradeAssetKey(baseTarget))?.balance).toBe('200')
  })

  it('includes native assets for enabled supported chains without balance rows', () => {
    const assets = buildTradeAssetOptions({
      balances: [],
      networks: {
        1: { on: true },
        8453: { on: false }
      },
      networksMeta: {
        1: { nativeCurrency: { decimals: 18, name: 'Ether', symbol: 'ETH' } },
        8453: { nativeCurrency: { decimals: 18, name: 'Ether', symbol: 'ETH' } }
      },
      runtime: { profile: 'prod' }
    })

    expect(assets).toHaveLength(1)
    expect(assets[0]).toMatchObject({
      address: FLASH_NATIVE_ETH_TOKEN_ADDRESS,
      chainId: 1,
      isNative: true,
      name: 'Ether',
      symbol: 'ETH'
    })
  })
})
