import {
  createInitialTradeState,
  getTradeInputAmount,
  tradeReducer
} from '../../../../app/dapp/Trade/tradeReducer'
import {
  FLASH_LIMIT_ORDER_TYPE,
  FLASH_MARKET_ORDER_TYPE,
  FLASH_NATIVE_ETH_ASSET,
  FLASH_STOP_LOSS_ORDER_TYPE,
  FLASH_STOP_ORDER_TYPE,
  FLASH_TAKE_PROFIT_ORDER_TYPE,
  FLASH_USDC_ASSET,
  FLASH_WETH_ASSET,
  type FlashAsset,
  type FlashQuote
} from '../../../../resources/domain/flash'
import { NATIVE_CURRENCY } from '../../../../resources/constants'

function marketQuote(id = 'quote-1'): FlashQuote {
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
        amountRaw: '1000000000000000000',
        tx: {
          chainId: FLASH_WETH_ASSET.chainId,
          to: '0xspender',
          data: '0x'
        }
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

    expect(generic.targetAsset).toBe(FLASH_WETH_ASSET)
    expect(generic.contraAsset).toBe(FLASH_USDC_ASSET)
    expect(generic.side).toBe('sell')
    expect(explicitUsdc.targetAsset).toBe(FLASH_USDC_ASSET)
    expect(explicitUsdc.contraAsset).toBe(FLASH_WETH_ASSET)
    expect(explicitUsdc.side).toBe('sell')
    expect(onlyUsdc.targetAsset).toBe(FLASH_WETH_ASSET)
    expect(onlyUsdc.contraAsset).toBe(FLASH_USDC_ASSET)
    expect(onlyUsdc.side).toBe('buy')
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
      flashPayload: { quoteId: 'stale' }
    })
    const succeeded = tradeReducer(stale, {
      type: 'quoteSucceeded',
      requestKey: 'fresh',
      quote: marketQuote('fresh'),
      flashPayload: { quoteId: 'fresh' }
    })

    expect(entered.quote).toBe(null)
    expect(requested.pendingAction).toBe('quote')
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
        flashPayload: { quoteId: 'fresh' }
      }
    )
    const pending = tradeReducer(ready, {
      type: 'actionStarted',
      actionQuoteId: 'fresh',
      stepKind: 'approve',
      status: 'Confirm in Newframe'
    })
    const changed = tradeReducer(pending, { type: 'accountChanged' })

    expect(getTradeInputAmount(changed)).toBe('1')
    expect(changed.targetAsset).toBe(FLASH_WETH_ASSET)
    expect(changed.contraAsset).toMatchObject({
      chainId: FLASH_USDC_ASSET.chainId,
      symbol: FLASH_USDC_ASSET.symbol
    })
    expect(changed.quote).toBe(null)
    expect(changed.flashPayload).toBe(null)
    expect(changed.actionQuoteId).toBe('')
    expect(changed.pendingAction).toBe('quote')
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
    expect(quoted.pendingAction).toBe('quote')
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
