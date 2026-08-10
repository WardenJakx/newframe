import { expect, it } from 'bun:test'

import { fireEvent, render, screen } from '../../../../../test/support/componentSetup'
import {
  FLASH_LIMIT_ORDER_TYPE,
  FLASH_MARKET_ORDER_TYPE,
  FLASH_STOP_ORDER_TYPE,
  FLASH_TAKE_PROFIT_ORDER_TYPE,
  FLASH_TWAP_ORDER_TYPE
} from '../domain/constants'
import { TradeView } from './TradeView'
import type { TradeAssetViewModel, TradeViewEvents, TradeViewModel } from './tradeViewModel'
import { createTradeCapabilityFake } from './tradeService.test-support'

function asset(field: 'target' | 'contra', symbol: string, editable: boolean): TradeAssetViewModel {
  const selectorItem = {
    id: `${field}-asset`,
    symbol,
    amountLabel: '2',
    notionalLabel: '$4,800.00',
    chainId: 31337
  }

  return {
    amount: editable ? '1' : '2400',
    balanceLabel: `Balance 2 ${symbol}`,
    balancePercent: editable ? 50 : 0,
    border: editable ? 'danger' : 'subtle',
    canSwitchDirection: field === 'target',
    editable,
    field,
    intent: field === 'target' ? 'SELL' : 'FOR',
    intentTone: field === 'target' ? 'danger' : 'primary',
    open: false,
    outputNotionalLabel: editable ? '' : '~$2,390.00',
    rowsHidden: 0,
    searchableItems: [selectorItem],
    selectedId: selectorItem.id,
    selectorItems: [selectorItem],
    symbol
  }
}

function viewProps() {
  const balancePercentChanges: Parameters<TradeViewEvents['onBalancePercentChange']>[] = []
  const inputAmountChanges: Parameters<TradeViewEvents['onInputAmountChange']>[] = []
  const orderTypeChanges: Parameters<TradeViewEvents['onOrderTypeChange']>[] = []
  const reviewCalls: Parameters<TradeViewEvents['onReview']>[] = []
  const events: TradeViewEvents = {
    onAssetOpenChange: () => undefined,
    onBalancePercentChange: (...args) => balancePercentChanges.push(args),
    onClose: () => undefined,
    onInputAmountChange: (...args) => inputAmountChanges.push(args),
    onOrderFieldChange: () => undefined,
    onOrderTypeChange: (...args) => orderTypeChanges.push(args),
    onReview: (...args) => reviewCalls.push(args),
    onSelectAsset: () => undefined,
    onShowMoreAssets: () => undefined,
    onSlippageChange: () => undefined,
    onTimeInForceChange: () => undefined,
    onToggleAdvanced: () => undefined,
    onToggleSide: () => undefined
  }
  const model: TradeViewModel = {
    action: { enabled: true, label: 'Review/sign' },
    networks: {},
    networksMeta: {},
    progress: {
      status: 'Review order in Newframe',
      steps: [
        { id: 'approve', label: 'Approve WETH', status: 'complete' },
        { id: 'sign', label: 'Sign order', status: 'pending' },
        { id: 'submit', label: 'Submit order', status: 'required' }
      ]
    },
    quote: {
      estimatedFeeLabel: '$1.25',
      estimatedImpactDanger: false,
      estimatedImpactLabel: '0.42%',
      outputAmountLabel: '2400 USDC',
      outputNotionalLabel: '~$2,390.00',
      targetPriceLabel: '$2,400.00',
      targetPricePairLabel: 'WETH/USD'
    },
    ticket: {
      advancedOpen: false,
      contra: asset('contra', 'USDC', false),
      durationDays: '0',
      durationHours: '1',
      durationMinutes: '0',
      expireTime: '',
      limitNotionalPrice: '',
      maxPriceImpact: '',
      minimumDateTime: '2026-08-09T12:00',
      orderType: FLASH_MARKET_ORDER_TYPE,
      side: 'sell',
      slippage: '',
      startTime: '',
      target: asset('target', 'WETH', true),
      timeInForce: 'gtc',
      triggerDeltaLabel: '—',
      triggerHelp: 'Quoted against WETH/USD',
      triggerNotionalPrice: '',
      twapBucketCount: ''
    },
    validation: {
      error: '',
      invalidFields: {
        amount: false,
        duration: false,
        expireTime: false,
        limitPrice: false,
        maxPriceImpact: false,
        slippage: false,
        startTime: false,
        triggerPrice: false,
        twapBucketCount: false
      }
    }
  }

  return { balancePercentChanges, events, inputAmountChanges, model, orderTypeChanges, reviewCalls }
}

it('renders semantic ticket, quote, and progress models and emits named events', () => {
  const props = viewProps()
  render(<TradeView capability={createTradeCapabilityFake()} events={props.events} model={props.model} />)

  expect(screen.getByText('2400 USDC')).toBeTruthy()
  expect(screen.getByText('Review order in Newframe')).toBeTruthy()
  expect(screen.getByText('Sign order')).toBeTruthy()

  fireEvent.change(screen.getByLabelText('WETH amount'), { target: { value: '1.5' } })
  fireEvent.change(screen.getByLabelText('WETH amount percentage'), { target: { value: '75' } })
  fireEvent.click(screen.getByRole('tab', { name: 'TWAP' }))
  fireEvent.click(screen.getByRole('button', { name: 'Review/sign' }))

  expect(props.inputAmountChanges).toHaveLength(1)
  expect(props.inputAmountChanges[0]?.[0]).toBe('1.5')
  expect(props.balancePercentChanges).toHaveLength(1)
  expect(props.balancePercentChanges[0]?.[0]).toBe('target')
  expect(props.balancePercentChanges[0]?.[1]).toBe(75)
  expect(props.orderTypeChanges).toHaveLength(1)
  expect(props.orderTypeChanges[0]?.[0]).toBe(FLASH_TWAP_ORDER_TYPE)
  expect(props.reviewCalls).toHaveLength(1)
})

it('renders each progressive order-field surface from its view model', () => {
  const props = viewProps()
  const { rerender } = render(
    <TradeView capability={createTradeCapabilityFake()} events={props.events} model={props.model} />
  )
  const show = (orderType: TradeViewModel['ticket']['orderType']) => {
    props.model.ticket.orderType = orderType
    props.model.ticket.advancedOpen = true
    rerender(<TradeView capability={createTradeCapabilityFake()} events={props.events} model={props.model} />)
  }

  show(FLASH_LIMIT_ORDER_TYPE)
  expect(screen.getByLabelText('Limit price')).toBeTruthy()
  show(FLASH_TWAP_ORDER_TYPE)
  expect(screen.getByLabelText('TWAP duration hours')).toBeTruthy()
  expect(screen.getByLabelText('TWAP segments')).toBeTruthy()
  show(FLASH_TAKE_PROFIT_ORDER_TYPE)
  expect(screen.getByLabelText('Take-profit trigger price')).toBeTruthy()
  show(FLASH_STOP_ORDER_TYPE)
  expect(screen.getByLabelText('Stop trigger price')).toBeTruthy()
})
