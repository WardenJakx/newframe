import { describe, expect, it } from 'bun:test'

import {
  buildTradeQuoteRequest,
  buildMarketTradeQuoteRequest,
  buildTradeActionRequest,
  buildTradePermitSignatureRequest,
  buildTradeSignatureRequest,
  buildTradeSubmitRequest,
  cleanTradeAmount,
  getEstimatedTradePriceImpact,
  getTradeDurationSeconds,
  getTradeQuoteValidationError,
  getTradeValidationError,
  marketTradeQuoteRequestKey
} from '../../../../app/sidetray/Trade/tradeTransaction'
import {
  FLASH_ANVIL_CHAIN_ID,
  FLASH_LIMIT_ORDER_TYPE,
  FLASH_MARKET_ORDER_TYPE,
  FLASH_STOP_LOSS_ORDER_TYPE,
  FLASH_STOP_ORDER_TYPE,
  FLASH_TAKE_PROFIT_ORDER_TYPE,
  FLASH_TWAP_ORDER_TYPE
} from '../../../../resources/domain/flash/constants'
import { FLASH_USDC_ASSET, FLASH_WETH_ASSET } from '../../../../resources/domain/flash/assets'
import { type FlashQuote } from '../../../../resources/domain/flash/schemas'

describe('tradeTransaction', () => {
  const quoteRequestBase = {
    accountAddress: '0xsender',
    contraAsset: FLASH_USDC_ASSET,
    inputAmount: '1',
    quickTrade: false,
    side: 'sell' as const,
    slippage: '',
    targetAsset: FLASH_WETH_ASSET
  }

  it('cleans amounts and builds market quote requests with execution protection', () => {
    const base = {
      ...quoteRequestBase,
      inputAmount: ' 1,200.50 '
    }

    expect(cleanTradeAmount(base.inputAmount)).toBe('1200.50')
    const automatic = buildMarketTradeQuoteRequest(base)

    expect(automatic).toEqual({
      accountAddress: '0xsender',
      chainId: FLASH_ANVIL_CHAIN_ID,
      contraAsset: FLASH_USDC_ASSET,
      contraChain: FLASH_ANVIL_CHAIN_ID,
      inputAmount: '1200.50',
      orderType: FLASH_MARKET_ORDER_TYPE,
      qty: '1200.50',
      side: 'sell',
      targetAsset: FLASH_WETH_ASSET,
      targetChain: FLASH_ANVIL_CHAIN_ID
    })
    expect(automatic).not.toHaveProperty('slippage')

    expect(
      buildMarketTradeQuoteRequest({
        ...base,
        quickTrade: true,
        slippage: '1.00'
      })
    ).toMatchObject({
      quickTrade: true,
      slippage: '1.00'
    })
  })

  it('maps limit, trigger, and TWAP fields to Flash quote payloads', () => {
    const expiry = '2099-01-02T03:04:00.000Z'
    const limit = buildTradeQuoteRequest({
      ...quoteRequestBase,
      expireTime: expiry,
      limitNotionalPrice: '2,500',
      orderType: FLASH_LIMIT_ORDER_TYPE,
      timeInForce: 'gtt'
    })
    const takeProfit = buildTradeQuoteRequest({
      ...quoteRequestBase,
      limitNotionalPrice: '2490',
      orderType: FLASH_TAKE_PROFIT_ORDER_TYPE,
      triggerNotionalPrice: '2500'
    })
    const stopLoss = buildTradeQuoteRequest({
      ...quoteRequestBase,
      orderType: FLASH_STOP_LOSS_ORDER_TYPE,
      triggerNotionalPrice: '2100'
    })
    const stopBuy = buildTradeQuoteRequest({
      ...quoteRequestBase,
      limitNotionalPrice: '2610',
      orderType: FLASH_STOP_ORDER_TYPE,
      side: 'buy',
      triggerNotionalPrice: '2600'
    })
    const twap = buildTradeQuoteRequest({
      ...quoteRequestBase,
      durationDays: '1',
      durationHours: '2',
      durationMinutes: '3',
      maxPriceImpact: '4.5',
      orderType: FLASH_TWAP_ORDER_TYPE,
      twapBucketCount: '12'
    })
    const automaticTwap = buildTradeQuoteRequest({
      ...quoteRequestBase,
      durationDays: '0',
      durationHours: '1',
      durationMinutes: '0',
      maxPriceImpact: '',
      orderType: FLASH_TWAP_ORDER_TYPE,
      twapBucketCount: ''
    })

    expect(limit).toMatchObject({
      expireTime: expiry,
      limitNotionalPrice: '2500',
      orderType: FLASH_LIMIT_ORDER_TYPE
    })
    expect(takeProfit).toMatchObject({
      limitNotionalPrice: '2490',
      orderType: FLASH_TAKE_PROFIT_ORDER_TYPE,
      triggers: [{ notionalPrice: '2500', triggerType: 'upper' }]
    })
    expect(stopLoss).toMatchObject({
      orderType: FLASH_STOP_LOSS_ORDER_TYPE,
      triggers: [{ notionalPrice: '2100', triggerType: 'lower' }]
    })
    expect(stopBuy).toMatchObject({
      limitNotionalPrice: '2610',
      orderType: FLASH_STOP_ORDER_TYPE,
      side: 'buy',
      triggers: [{ notionalPrice: '2600', triggerType: 'upper' }]
    })
    expect(twap).toMatchObject({
      durationSeconds: 93_780,
      maxPriceImpact: '4.5',
      orderType: FLASH_TWAP_ORDER_TYPE,
      twapBucketCount: 12
    })
    expect(twap).not.toHaveProperty('limitNotionalPrice')
    expect(twap).not.toHaveProperty('slippage')
    expect(automaticTwap).not.toHaveProperty('maxPriceImpact')
    expect(automaticTwap).not.toHaveProperty('twapBucketCount')
  })

  it('validates required order fields, trigger direction, and TWAP bounds', () => {
    expect(
      getTradeValidationError({
        inputAmount: '1',
        orderType: FLASH_MARKET_ORDER_TYPE,
        side: 'sell',
        slippage: ''
      })
    ).toBe('')
    expect(
      getTradeValidationError({
        durationDays: '0',
        durationHours: '1',
        durationMinutes: '0',
        inputAmount: '1',
        maxPriceImpact: '',
        orderType: FLASH_TWAP_ORDER_TYPE,
        side: 'sell'
      })
    ).toBe('')
    expect(
      getTradeValidationError({
        inputAmount: '1',
        orderType: FLASH_LIMIT_ORDER_TYPE,
        side: 'sell'
      })
    ).toBe('Enter a limit price.')
    expect(
      getTradeValidationError({
        durationDays: '0',
        durationHours: '0',
        durationMinutes: '4',
        inputAmount: '1',
        maxPriceImpact: '5',
        orderType: FLASH_TWAP_ORDER_TYPE,
        side: 'sell'
      })
    ).toBe('TWAP duration must be between 5 minutes and 30 days.')
    expect(
      getTradeValidationError({
        durationDays: '0',
        durationHours: '1',
        durationMinutes: '0',
        inputAmount: '1',
        maxPriceImpact: '101',
        orderType: FLASH_TWAP_ORDER_TYPE,
        side: 'sell'
      })
    ).toBe('Max price impact must be between 0% and 100%.')
    expect(
      getTradeValidationError({
        inputAmount: '1',
        orderType: FLASH_MARKET_ORDER_TYPE,
        side: 'sell',
        slippage: 'not-a-number'
      })
    ).toBe('Max slippage must be between 0% and 100%.')
    expect(
      getTradeValidationError({
        inputAmount: '1',
        limitNotionalPrice: 'not-a-number',
        orderType: FLASH_STOP_ORDER_TYPE,
        side: 'buy',
        triggerNotionalPrice: '2500'
      })
    ).toBe('Enter a valid limit price or leave it blank for a market order.')
    expect(
      getTradeValidationError({
        inputAmount: '1',
        orderType: FLASH_STOP_ORDER_TYPE,
        side: 'sell',
        triggerNotionalPrice: '2500'
      })
    ).toBe('Stop orders must buy the target asset.')
    expect(
      getTradeValidationError({
        inputAmount: '1',
        orderType: FLASH_TAKE_PROFIT_ORDER_TYPE,
        side: 'buy',
        triggerNotionalPrice: '2500'
      })
    ).toBe('TP/SL orders must sell the target asset.')
    expect(getTradeDurationSeconds({ durationDays: '1', durationHours: '2', durationMinutes: '3' })).toBe(
      93_780
    )
  })

  it('validates trigger prices against the quoted target price and estimates impact', () => {
    const market = {
      id: 'quote-market',
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

    expect(getEstimatedTradePriceImpact(market)).toBeCloseTo(0.5)
    expect(
      getTradeQuoteValidationError({
        orderType: FLASH_TAKE_PROFIT_ORDER_TYPE,
        quote: market,
        triggerNotionalPrice: '2300'
      })
    ).toBe('Take profit must be above the current WETH/USD price.')
    expect(
      getTradeQuoteValidationError({
        orderType: FLASH_STOP_LOSS_ORDER_TYPE,
        quote: market,
        triggerNotionalPrice: '2500'
      })
    ).toBe('Stop loss must be below the current WETH/USD price.')
    expect(
      getTradeQuoteValidationError({
        orderType: FLASH_STOP_ORDER_TYPE,
        quote: market,
        triggerNotionalPrice: '2500'
      })
    ).toBe('')
  })

  it('keys quote requests by account, assets, side, amount, and optional settings', () => {
    const first = buildMarketTradeQuoteRequest({
      ...quoteRequestBase
    })!
    const second = buildMarketTradeQuoteRequest({
      ...first,
      accountAddress: '0xother',
      quickTrade: true,
      slippage: '1.00'
    })!

    expect(marketTradeQuoteRequestKey(first)).not.toBe(marketTradeQuoteRequestKey(second))
  })

  it('builds a transaction request without renderer-controlled provider metadata', () => {
    expect(
      buildTradeActionRequest({
        accountAddress: '0xsender',
        action: {
          id: 'approval',
          kind: 'approve',
          label: 'Approve WETH',
          asset: FLASH_WETH_ASSET,
          amount: '1',
          amountRaw: '1000000000000000000',
          tx: {
            chainId: FLASH_ANVIL_CHAIN_ID,
            to: '0xspender',
            data: '0x095ea7b3'
          }
        }
      })
    ).toEqual({
      chainId: FLASH_ANVIL_CHAIN_ID,
      transaction: {
        to: '0xspender',
        data: '0x095ea7b3',
        value: '0x0'
      }
    })
  })

  it('finds typed data in Flash payloads and builds sign payloads', () => {
    const quote = {
      id: 'quote-1',
      side: 'sell',
      orderType: FLASH_MARKET_ORDER_TYPE,
      targetAsset: FLASH_WETH_ASSET,
      contraAsset: FLASH_USDC_ASSET,
      spentAsset: FLASH_WETH_ASSET,
      receiveAsset: FLASH_USDC_ASSET,
      inputAmount: '1',
      outputAmount: '2400',
      steps: []
    } satisfies FlashQuote
    const typedData = {
      domain: { chainId: FLASH_ANVIL_CHAIN_ID },
      message: { quoteId: quote.id },
      primaryType: 'Order',
      types: { Order: [] }
    }

    expect(
      buildTradeSignatureRequest({
        accountAddress: '0xsender',
        flashPayload: { actions: { evm: { orderTypedData: typedData } } },
        quote
      })
    ).toEqual({
      chainId: FLASH_ANVIL_CHAIN_ID,
      typedData
    })

    const permitTypedData = {
      domain: { chainId: FLASH_ANVIL_CHAIN_ID },
      message: { permitted: true },
      primaryType: 'Permit',
      types: { Permit: [] }
    }
    const orderTypedDataRaw = ` ${JSON.stringify(typedData, null, 2)} `
    const permitTypedDataRaw = `\n${JSON.stringify(permitTypedData)}\n`
    const flashPayload = {
      evm: {
        orderTypedData: typedData,
        orderTypedDataRaw,
        permitTypedData,
        permitTypedDataRaw
      }
    }

    expect(
      buildTradePermitSignatureRequest({
        accountAddress: '0xsender',
        flashPayload,
        quote
      })
    ).toEqual({
      chainId: FLASH_ANVIL_CHAIN_ID,
      typedData: permitTypedData
    })

    expect(() =>
      buildTradeSubmitRequest({
        accountAddress: '0xsender',
        flashPayload,
        quickTrade: false,
        quote,
        signature: '0xorder',
        slippage: '0.50'
      })
    ).toThrow('Flash quote requires a permit signature.')

    expect(
      buildTradeSubmitRequest({
        accountAddress: '0xsender',
        flashPayload,
        permitSignature: '0xpermit',
        quickTrade: false,
        quote,
        signature: '0xorder',
        slippage: '0.50'
      })
    ).toMatchObject({
      evmOrderTypedData: orderTypedDataRaw,
      evmPermitSignature: '0xpermit',
      evmPermitTypedData: permitTypedDataRaw,
      orderSignature: '0xorder'
    })
  })
})
