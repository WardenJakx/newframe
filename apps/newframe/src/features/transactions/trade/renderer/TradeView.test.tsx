import { expect, it, mock } from 'bun:test'

import { fireEvent, render, screen } from '../../../../../test/support/componentSetup'
import { FLASH_MARKET_ORDER_TYPE, FLASH_TWAP_ORDER_TYPE } from '../domain/constants'
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
  const onOrderTypeChange = mock<TradeViewEvents['onOrderTypeChange']>(() => undefined)
  const onInputAmountChange = mock<TradeViewEvents['onInputAmountChange']>(() => undefined)
  const onReview = mock<TradeViewEvents['onReview']>(() => undefined)
  const events: TradeViewEvents = {
    onAssetOpenChange: mock(() => undefined),
    onBalancePercentChange: mock(() => undefined),
    onClose: mock(() => undefined),
    onInputAmountChange,
    onOrderFieldChange: mock(() => undefined),
    onOrderTypeChange,
    onReview,
    onSelectAsset: mock(() => undefined),
    onShowMoreAssets: mock(() => undefined),
    onSlippageChange: mock(() => undefined),
    onTimeInForceChange: mock(() => undefined),
    onToggleAdvanced: mock(() => undefined),
    onToggleSide: mock(() => undefined)
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

  return { events, model, onInputAmountChange, onOrderTypeChange, onReview }
}

it('renders semantic ticket, quote, and progress models and emits named events', () => {
  const props = viewProps()
  render(<TradeView capability={createTradeCapabilityFake()} events={props.events} model={props.model} />)

  expect(screen.getByText('2400 USDC')).toBeTruthy()
  expect(screen.getByText('Review order in Newframe')).toBeTruthy()
  expect(screen.getByText('Sign order')).toBeTruthy()

  fireEvent.change(screen.getByLabelText('WETH amount'), { target: { value: '1.5' } })
  fireEvent.click(screen.getByRole('tab', { name: 'TWAP' }))
  fireEvent.click(screen.getByRole('button', { name: 'Review/sign' }))

  expect(props.onInputAmountChange).toHaveBeenCalledWith('1.5')
  expect(props.onOrderTypeChange).toHaveBeenCalledWith(FLASH_TWAP_ORDER_TYPE)
  expect(props.onReview).toHaveBeenCalledTimes(1)
})
