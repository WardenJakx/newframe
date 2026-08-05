import { describe, expect, it } from 'bun:test'

import { createInitialTradeState, getTradeInputAmount, tradeReducer } from './tradeReducer'
import {
  FLASH_LIMIT_ORDER_TYPE,
  FLASH_MARKET_ORDER_TYPE,
  FLASH_STOP_LOSS_ORDER_TYPE,
  FLASH_STOP_ORDER_TYPE,
  FLASH_TAKE_PROFIT_ORDER_TYPE
} from '../../../domain/flash/constants'
import { FLASH_NATIVE_ETH_ASSET, FLASH_USDC_ASSET, FLASH_WETH_ASSET } from '../../../domain/flash/assets'
import { type FlashAsset } from '../../../domain/flash/schemas'
import type { FlashQuoteDisplay } from '../../../contracts/operations'
import { NATIVE_CURRENCY } from '../../../domain/token/constants'

function marketQuote(id = 'quote-1'): FlashQuoteDisplay {
  return {
    id,
    side: 'sell',
    orderType: FLASH_MARKET_ORDER_TYPE,
    targetAsset: FLASH_WETH_ASSET,
    contraAsset: FLASH_USDC_ASSET,
    spentAsset: FLASH_WETH_ASSET,
    receiveAsset: FLASH_USDC_ASSET,
    inputAmount: '1',
    outputAmount: '2400',
    nextAction: 'approve',
    requiresPermit: false,
    steps: [
      { id: 'approve', kind: 'approve', label: 'Approve WETH', status: 'required' },
      { id: 'sign', kind: 'sign', label: 'Sign order', status: 'required' },
      { id: 'submit', kind: 'submit', label: 'Submit order', status: 'required' }
    ],
    actions: {
      approval: {
        id: 'approval',
        kind: 'approve',
        label: 'Approve WETH',
        asset: FLASH_WETH_ASSET,
        amount: '1',
        amountRaw: '1000000000000000000'
      }
    }
  }
}

describe('tradeReducer', () => {
  it('initializes side and contra asset from available balances', () => {
    const withTargetBalance = createInitialTradeState({
      assetId: FLASH_WETH_ASSET.id,
      balances: [{ assetId: FLASH_WETH_ASSET.id, symbol: FLASH_WETH_ASSET.symbol, balance: '1' }]
    })
    const withoutTargetBalance = createInitialTradeState({
      assetId: FLASH_WETH_ASSET.id,
      balances: [{ assetId: FLASH_USDC_ASSET.id, symbol: FLASH_USDC_ASSET.symbol, balance: '1' }]
    })

    expect(withTargetBalance.side).toBe('sell')
    expect(withTargetBalance.contraAsset).toMatchObject({
      chainId: FLASH_USDC_ASSET.chainId,
      symbol: FLASH_USDC_ASSET.symbol
    })
    expect(withTargetBalance.slippage).toBe('')
    expect(withTargetBalance.maxPriceImpact).toBe('')
    expect(withTargetBalance.startTime).toBe('')
    expect(withTargetBalance.timeInForce).toBe('gtc')
    expect(withoutTargetBalance.side).toBe('buy')
  })

  it('selects the preferred contra before the target for generic entry', () => {
    const assets = [FLASH_USDC_ASSET, FLASH_WETH_ASSET, FLASH_NATIVE_ETH_ASSET]
    const balances = [
      { assetId: FLASH_USDC_ASSET.id, balance: '1000000000000' },
      { assetId: FLASH_WETH_ASSET.id, balance: '10000000000000000000' }
    ]
    const generic = createInitialTradeState({ assets, balances, chainId: FLASH_WETH_ASSET.chainId })
    const explicitUsdc = createInitialTradeState({
      assetId: FLASH_USDC_ASSET.id,
      assets,
      balances,
      chainId: FLASH_WETH_ASSET.chainId
    })
    const onlyUsdc = createInitialTradeState({
      assets,
      balances: [{ assetId: FLASH_USDC_ASSET.id, balance: '1000000000000' }],
      chainId: FLASH_WETH_ASSET.chainId
    })
    const onlyWeth = createInitialTradeState({
      assets,
      balances: [
        { assetId: FLASH_WETH_ASSET.id, balance: '10000000000000000000' },
        { assetId: FLASH_NATIVE_ETH_ASSET.id, balance: '10000000000000000000' }
      ],
      chainId: FLASH_WETH_ASSET.chainId
    })

    expect(generic.targetAsset).toBe(FLASH_WETH_ASSET)
    expect(generic.contraAsset).toBe(FLASH_USDC_ASSET)
    expect(generic.side).toBe('sell')
    expect(explicitUsdc.targetAsset).toBe(FLASH_USDC_ASSET)
    expect(explicitUsdc.contraAsset).toBe(FLASH_WETH_ASSET)
    expect(explicitUsdc.side).toBe('sell')
    expect(onlyUsdc.targetAsset).toBe(FLASH_WETH_ASSET)
    expect(onlyUsdc.contraAsset).toBe(FLASH_USDC_ASSET)
    expect(onlyUsdc.side).toBe('buy')
    expect(onlyWeth.targetAsset).toBe(FLASH_WETH_ASSET)
    expect(onlyWeth.contraAsset).toBe(FLASH_USDC_ASSET)
    expect(onlyWeth.side).toBe('sell')
  })

  it('uses the sell-specific contra priority during initialization', () => {
    const targetAsset: FlashAsset = {
      id: `${FLASH_WETH_ASSET.chainId}:0x0000000000000000000000000000000000000001`,
      symbol: 'TOKEN',
      name: 'Token',
      decimals: 18,
      chainId: FLASH_WETH_ASSET.chainId,
      isNative: false,
      address: '0x0000000000000000000000000000000000000001'
    }
    const assets = [FLASH_WETH_ASSET, targetAsset, FLASH_NATIVE_ETH_ASSET, FLASH_USDC_ASSET]
    const state = createInitialTradeState({
      assetId: targetAsset.id,
      assets,
      balances: [
        { assetId: targetAsset.id, balance: '1' },
        { assetId: FLASH_WETH_ASSET.id, balance: '1' },
        { assetId: FLASH_NATIVE_ETH_ASSET.id, balance: '1' }
      ]
    })

    expect(state.side).toBe('sell')
    expect(state.contraAsset).toBe(FLASH_WETH_ASSET)
    expect(state.assetOptions).toEqual(assets)
  })

  it('keeps target and contra assets distinct when selecting assets', () => {
    const state = createInitialTradeState()
    const next = tradeReducer(state, {
      type: 'selectAsset',
      field: 'target',
      asset: state.contraAsset
    })

    expect(next.targetAsset).toBe(state.contraAsset)
    expect(next.contraAsset).not.toBe(next.targetAsset)
  })

  it('preserves independently selected assets across supported chains and order-type switches', () => {
    const ethereumWeth = { ...FLASH_WETH_ASSET, chainId: 1, id: `1:${FLASH_WETH_ASSET.address}` }
    const ethereumUsdc = { ...FLASH_USDC_ASSET, chainId: 1, id: `1:${FLASH_USDC_ASSET.address}` }
    const baseWeth = { ...FLASH_WETH_ASSET, chainId: 8453, id: `8453:${FLASH_WETH_ASSET.address}` }
    const baseUsdc = { ...FLASH_USDC_ASSET, chainId: 8453, id: `8453:${FLASH_USDC_ASSET.address}` }
    const assets = [ethereumWeth, ethereumUsdc, baseWeth, baseUsdc]

    const ethereumTarget = createInitialTradeState({ assetId: ethereumWeth.id, assets })
    const ethereumToBase = tradeReducer(ethereumTarget, {
      type: 'selectAsset',
      field: 'contra',
      asset: baseUsdc
    })
    expect(ethereumToBase.targetAsset).toBe(ethereumWeth)
    expect(ethereumToBase.contraAsset).toBe(baseUsdc)

    const baseTargetSelected = tradeReducer(ethereumTarget, {
      type: 'selectAsset',
      field: 'target',
      asset: baseWeth
    })
    expect(baseTargetSelected.targetAsset).toBe(baseWeth)
    expect(baseTargetSelected.contraAsset).toBe(ethereumUsdc)

    const baseTarget = createInitialTradeState({ assetId: baseWeth.id, assets })
    const baseToEthereum = tradeReducer(baseTarget, {
      type: 'selectAsset',
      field: 'contra',
      asset: ethereumUsdc
    })
    expect(baseToEthereum.targetAsset).toBe(baseWeth)
    expect(baseToEthereum.contraAsset).toBe(ethereumUsdc)

    const withAmount = tradeReducer(baseToEthereum, { type: 'setInputAmount', inputAmount: '1' })
    const limit = tradeReducer(withAmount, {
      type: 'setOrderType',
      orderType: FLASH_LIMIT_ORDER_TYPE
    })
    expect(limit.targetAsset).toBe(baseWeth)
    expect(limit.contraAsset).toBe(ethereumUsdc)
    expect(limit.quoteLoading).toBe(false)

    const market = tradeReducer(limit, {
      type: 'setOrderType',
      orderType: FLASH_MARKET_ORDER_TYPE
    })
    expect(market.targetAsset).toBe(baseWeth)
    expect(market.contraAsset).toBe(ethereumUsdc)
    expect(getTradeInputAmount(market)).toBe('1')
  })

  it('keeps cross-chain selections when synchronized asset options refresh', () => {
    const targetAsset = { ...FLASH_WETH_ASSET, chainId: 8453, id: `8453:${FLASH_WETH_ASSET.address}` }
    const contraAsset = { ...FLASH_USDC_ASSET, chainId: 1, id: `1:${FLASH_USDC_ASSET.address}` }
    const assets = [targetAsset, contraAsset]
    const selected = tradeReducer(createInitialTradeState({ assetId: targetAsset.id, assets }), {
      type: 'selectAsset',
      field: 'contra',
      asset: contraAsset
    })
    const refreshedAssets = assets.map((asset) => ({ ...asset }))
    const refreshed = tradeReducer(selected, { type: 'setAssetOptions', assets: refreshedAssets })

    expect(refreshed.targetAsset.chainId).toBe(8453)
    expect(refreshed.contraAsset.chainId).toBe(1)
  })

  it('preserves selected asset identity when synchronized options are equivalent', () => {
    const state = createInitialTradeState({
      assets: [FLASH_WETH_ASSET, FLASH_USDC_ASSET]
    })
    const nextAssets = [{ ...FLASH_WETH_ASSET }, { ...FLASH_USDC_ASSET }]
    const next = tradeReducer(state, {
      type: 'setAssetOptions',
      assets: nextAssets
    })

    expect(next.assetOptions).toBe(nextAssets)
    expect(next.targetAsset).toBe(state.targetAsset)
    expect(next.contraAsset).toBe(state.contraAsset)
  })

  it('clears market execution state on input changes and ignores stale quote responses', () => {
    const entered = tradeReducer(createInitialTradeState(), {
      type: 'setInputAmount',
      inputAmount: '1'
    })
    const requested = tradeReducer(entered, {
      type: 'quoteRequested',
      requestKey: 'fresh'
    })
    const stale = tradeReducer(requested, {
      type: 'quoteSucceeded',
      requestKey: 'stale',
      quote: marketQuote('stale'),
      quoteId: 'stale'
    })
    const succeeded = tradeReducer(stale, {
      type: 'quoteSucceeded',
      requestKey: 'fresh',
      quote: marketQuote('fresh'),
      quoteId: 'fresh'
    })

    expect(entered.quote).toBe(null)
    expect(requested.quoteLoading).toBe(true)
    expect(stale.quote).toBe(null)
    expect(succeeded.quote?.id).toBe('fresh')
    expect(succeeded.contraAmount).toBe('2400')
  })

  it('invalidates market quote and action state on account changes without resetting the ticket', () => {
    const ready = tradeReducer(
      tradeReducer(tradeReducer(createInitialTradeState(), { type: 'setInputAmount', inputAmount: '1' }), {
        type: 'quoteRequested',
        requestKey: 'fresh'
      }),
      {
        type: 'quoteSucceeded',
        requestKey: 'fresh',
        quote: marketQuote('fresh'),
        quoteId: 'fresh'
      }
    )
    const changed = tradeReducer(ready, { type: 'accountChanged' })

    expect(getTradeInputAmount(changed)).toBe('1')
    expect(changed.targetAsset).toBe(FLASH_WETH_ASSET)
    expect(changed.contraAsset).toMatchObject({
      chainId: FLASH_USDC_ASSET.chainId,
      symbol: FLASH_USDC_ASSET.symbol
    })
    expect(changed.quote).toBe(null)
    expect(changed.quoteId).toBe('')
    expect(changed.quoteLoading).toBe(true)
  })

  it('does not create renderer-local non-market quotes', () => {
    const state = createInitialTradeState({
      assetId: `${FLASH_NATIVE_ETH_ASSET.chainId}:${NATIVE_CURRENCY}`
    })
    const withAmount = tradeReducer(state, { type: 'setInputAmount', inputAmount: '2' })
    const limit = tradeReducer(withAmount, { type: 'setOrderType', orderType: FLASH_LIMIT_ORDER_TYPE })
    const quoted = tradeReducer(limit, {
      type: 'setOrderField',
      field: 'limitNotionalPrice',
      value: '2500'
    })

    expect(limit.orderType).toBe(FLASH_LIMIT_ORDER_TYPE)
    expect(limit.quote).toBe(null)
    expect(quoted.quote).toBe(null)
    expect(quoted.quoteLoading).toBe(true)
  })

  it('locks Stop to buys and TP/SL to sells', () => {
    const withAmount = tradeReducer(createInitialTradeState(), {
      type: 'setInputAmount',
      inputAmount: '1'
    })
    const stop = tradeReducer(withAmount, {
      type: 'setOrderType',
      orderType: FLASH_STOP_ORDER_TYPE
    })
    const takeProfit = tradeReducer(stop, {
      type: 'setOrderType',
      orderType: FLASH_TAKE_PROFIT_ORDER_TYPE
    })
    const stopLoss = tradeReducer(takeProfit, {
      type: 'setOrderType',
      orderType: FLASH_STOP_LOSS_ORDER_TYPE
    })

    expect(tradeReducer(withAmount, { type: 'setOrderType', orderType: withAmount.orderType })).toBe(
      withAmount
    )
    expect(stop.side).toBe('buy')
    expect(stop.orderType).toBe(FLASH_STOP_ORDER_TYPE)
    expect(takeProfit.side).toBe('sell')
    expect(takeProfit.orderType).toBe(FLASH_TAKE_PROFIT_ORDER_TYPE)
    expect(stopLoss.side).toBe('sell')
    expect(stopLoss.orderType).toBe(FLASH_STOP_LOSS_ORDER_TYPE)
    expect(tradeReducer(stopLoss, { type: 'toggleSide' })).toBe(stopLoss)
  })
})
