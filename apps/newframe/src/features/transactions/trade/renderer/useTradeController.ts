import React from 'react'

import { createBalanceTokenSelectorItem, createDisplayBalance } from '../../../asset-data/domain/balance'
import { persistedImageSource } from '../../../asset-data/domain/image'
import {
  FLASH_STOP_LOSS_ORDER_TYPE,
  FLASH_STOP_ORDER_TYPE,
  FLASH_TAKE_PROFIT_ORDER_TYPE
} from '../domain/constants'
import { getContraPreposition, getDirectionLabel, isSameFlashAsset } from '../domain/pair'
import type { FlashAsset } from '../domain/schemas'
import { formatUnits, toBigInt } from '../../../../shared/domain/units'
import { createSideTrayWalletSelector } from '../../../../platform/state-sync/renderer/selectors/sideTrayWallet'
import { useSideTraySelector } from '../../../../platform/state-sync/renderer/useAppSelector'
import {
  getTokenSelectorPage,
  INITIAL_TOKEN_SELECTOR_ROWS,
  TOKEN_SELECTOR_ROWS_INCREMENT
} from '../../../../shared/renderer/ui/tokenSelectorModel'
import {
  createInitialTradeState,
  getTradeInputAmount,
  getTradeOrderFields,
  getTradeSpentAsset,
  tradeReducer,
  type TradeAssetField
} from './tradeReducer'
import type { TradeCapability } from './tradeService'
import {
  buildTradeAssetOptions,
  buildVisualTradeSteps,
  createTradeBalanceIndex,
  formatTradeNotional,
  getEstimatedTradePriceImpact,
  getFlashBalanceEntries,
  getTradeAssetKey,
  getTradeQuoteValidationError,
  getTradeTriggerDeltaPercent,
  getTradeValidationError
} from './tradeTransaction'
import { useTradeExecution } from './useTradeExecution'
import { useTradeQuote, useTradeQuoteRequest } from './useTradeQuote'
import type { TradeAssetViewModel, TradeViewEvents, TradeViewModel } from './tradeViewModel'

const operationStatuses: Record<string, string> = {
  requesting: 'Starting trade',
  validating: 'Validating trade',
  wrapping: 'Confirm in Newframe',
  approving: 'Confirm in Newframe',
  signing_permit: 'Review permit in Newframe',
  signing_order: 'Review order in Newframe',
  submitting: 'Submitting order'
}
const completedStepCount: Record<string, number> = {
  awaiting_approval: 1,
  approving: 1,
  awaiting_submit: 2,
  signing_permit: 2,
  signing_order: 2,
  submitting: 3,
  submitted: 4
}
const pendingStepKinds: Record<string, string> = {
  wrapping: 'wrap',
  approving: 'approve',
  signing_permit: 'sign',
  signing_order: 'sign',
  submitting: 'submit'
}

function localDateTimeValue(date = new Date()) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

export interface TradeControllerOptions {
  assetId?: string | null
  capability: TradeCapability
  chainId?: number
}

export function useTradeController({ assetId, capability, chainId }: TradeControllerOptions): {
  events: TradeViewEvents
  model: TradeViewModel
} {
  const selectSideTrayWallet = React.useMemo(() => createSideTrayWalletSelector(), [])
  const { balanceSummaries, currentAccount, networks, networksMeta, operations, orders, runtime } =
    useSideTraySelector(selectSideTrayWallet)
  const tradeAssets = React.useMemo(
    () => buildTradeAssetOptions({ balances: balanceSummaries, networks, networksMeta, runtime }),
    [balanceSummaries, networks, networksMeta, runtime]
  )
  const tradeBalanceIndex = React.useMemo(() => createTradeBalanceIndex(balanceSummaries), [balanceSummaries])
  const flashBalanceEntries = React.useMemo(
    () => getFlashBalanceEntries(balanceSummaries, tradeAssets, tradeBalanceIndex),
    [balanceSummaries, tradeAssets, tradeBalanceIndex]
  )
  const [state, dispatch] = React.useReducer(
    tradeReducer,
    { assetId, assets: tradeAssets, balances: flashBalanceEntries, chainId },
    createInitialTradeState
  )
  const [assetRowsVisible, setAssetRowsVisible] = React.useState<Record<TradeAssetField, number>>({
    target: INITIAL_TOKEN_SELECTOR_ROWS,
    contra: INITIAL_TOKEN_SELECTOR_ROWS
  })
  const accountAddress = currentAccount?.address || ''
  const inputAmount = getTradeInputAmount(state)
  const quoteRequest = useTradeQuoteRequest({
    accountAddress,
    contraAsset: state.contraAsset,
    inputAmount,
    orderType: state.orderType,
    quickTrade: state.quickTrade,
    side: state.side,
    slippage: state.slippage,
    targetAsset: state.targetAsset,
    ...getTradeOrderFields(state)
  })
  const execution = useTradeExecution({ capability, operations, requestKey: quoteRequest.requestKey })
  const operation = execution.operation
  useTradeQuote({ capability, dispatch, paused: execution.blocksQuoteRefresh, quoteRequest })

  React.useEffect(() => {
    dispatch({ type: 'setAssetOptions', assets: tradeAssets, balances: flashBalanceEntries })
  }, [flashBalanceEntries, tradeAssets])

  React.useEffect(() => {
    dispatch({ type: 'accountChanged' })
  }, [accountAddress])

  React.useEffect(() => {
    if (operation?.status !== 'succeeded' || !execution.state.session) return
    const orderId = operation.entityRefs?.find((reference) => reference.type === 'order')?.id
    if (orderId && orders[orderId]) void capability.close()
  }, [capability, execution.state.session, operation, orders])

  const ticketValidationError = React.useMemo(() => {
    const validationError = getTradeValidationError({
      ...getTradeOrderFields(state),
      inputAmount,
      orderType: state.orderType,
      side: state.side,
      slippage: state.slippage,
      targetAsset: state.targetAsset,
      contraAsset: state.contraAsset
    })

    return !inputAmount && validationError === 'Enter an amount to trade.' ? '' : validationError
  }, [inputAmount, state])
  const quoteValidationError = React.useMemo(
    () =>
      getTradeQuoteValidationError({
        orderType: state.orderType,
        quote: state.quote,
        triggerNotionalPrice: state.triggerNotionalPrice
      }),
    [state.orderType, state.quote, state.triggerNotionalPrice]
  )
  const tradeValidationError = ticketValidationError || quoteValidationError
  const operationError = execution.state.error
  const invalidFields = {
    amount: ticketValidationError === 'Enter an amount to trade.',
    duration: ticketValidationError.startsWith('TWAP duration'),
    expireTime: ticketValidationError.startsWith('Choose a future expiry time'),
    limitPrice:
      ticketValidationError === 'Enter a limit price.' ||
      ticketValidationError.startsWith('Enter a valid limit price') ||
      ticketValidationError.startsWith('Enter a valid TWAP limit price'),
    maxPriceImpact: ticketValidationError.startsWith('Max price impact'),
    slippage: ticketValidationError.startsWith('Max slippage'),
    startTime: ticketValidationError.startsWith('Choose a future TWAP start time'),
    triggerPrice: ticketValidationError === 'Enter a trigger price.' || Boolean(quoteValidationError),
    twapBucketCount: ticketValidationError.startsWith('Segments must')
  }

  const getTradeLogoURI = React.useCallback(
    (asset: FlashAsset) => {
      const balance = tradeBalanceIndex.get(getTradeAssetKey(asset))

      return (
        balance?.logoURI ||
        (asset.isNative ? persistedImageSource(networksMeta[asset.chainId]?.nativeCurrency?.image) : '')
      )
    },
    [networksMeta, tradeBalanceIndex]
  )

  const createTradeSelectorItem = React.useCallback(
    (asset: FlashAsset) => {
      const balance = tradeBalanceIndex.get(getTradeAssetKey(asset))
      if (balance) return { ...createBalanceTokenSelectorItem(balance), id: getTradeAssetKey(asset) }

      return {
        id: getTradeAssetKey(asset),
        symbol: asset.symbol,
        searchText: [asset.name, asset.address].filter(Boolean).join(' '),
        amountLabel: '0',
        notionalLabel: '$0.00',
        chainId: asset.chainId,
        logoURI: getTradeLogoURI(asset)
      }
    },
    [getTradeLogoURI, tradeBalanceIndex]
  )

  const assetModel = React.useCallback(
    (field: TradeAssetField): TradeAssetViewModel => {
      const asset = field === 'target' ? state.targetAsset : state.contraAsset
      const oppositeAsset = field === 'target' ? state.contraAsset : state.targetAsset
      const amount = field === 'target' ? state.targetAmount : state.contraAmount
      const open = field === 'target' ? state.targetOpen : state.contraOpen
      const options = state.assetOptions.filter((option) => !isSameFlashAsset(option, oppositeAsset))
      const { items, rowsHidden } = getTokenSelectorPage({
        getId: getTradeAssetKey,
        items: options,
        open,
        rowsVisible: assetRowsVisible[field],
        selectedId: getTradeAssetKey(asset)
      })
      const balance = tradeBalanceIndex.get(getTradeAssetKey(asset))
      const displayBalance = balance ? createDisplayBalance(balance).displayBalance : '0'
      const rawBalance = toBigInt(balance?.balance || 0) || 0n
      const numericBalance = Number(formatUnits(rawBalance, asset.decimals))
      const numericAmount = Number(String(amount || '').replace(/,/g, ''))
      const balancePercent =
        Number.isFinite(numericBalance) &&
        numericBalance > 0 &&
        Number.isFinite(numericAmount) &&
        numericAmount > 0
          ? Math.min(100, Math.max(0, (numericAmount / numericBalance) * 100))
          : 0
      const editable = state.side === 'buy' ? field === 'contra' : field === 'target'
      const isTarget = field === 'target'
      const sideLocked = [
        FLASH_STOP_ORDER_TYPE,
        FLASH_STOP_LOSS_ORDER_TYPE,
        FLASH_TAKE_PROFIT_ORDER_TYPE
      ].includes(state.orderType)

      return {
        amount,
        balanceLabel: `Balance ${displayBalance} ${asset.symbol}`,
        balancePercent,
        border:
          editable && invalidFields.amount
            ? 'danger'
            : editable && state.side === 'buy'
              ? 'special'
              : editable && state.side === 'sell'
                ? 'danger'
                : 'subtle',
        canSwitchDirection: isTarget && !sideLocked,
        editable,
        field,
        intent: isTarget ? getDirectionLabel(state.side) : getContraPreposition(state.side).toUpperCase(),
        intentTone: isTarget ? (state.side === 'buy' ? 'special' : 'danger') : 'primary',
        open,
        outputNotionalLabel: state.quote?.outputNotional
          ? `~${formatTradeNotional(state.quote.outputNotional)}`
          : '',
        rowsHidden,
        searchableItems: options.map(createTradeSelectorItem),
        selectedId: getTradeAssetKey(asset),
        selectorItems: items.map(createTradeSelectorItem),
        symbol: asset.symbol
      }
    },
    [assetRowsVisible, createTradeSelectorItem, invalidFields.amount, state, tradeBalanceIndex]
  )

  const target = assetModel('target')
  const contra = assetModel('contra')
  const delta = getTradeTriggerDeltaPercent(state.triggerNotionalPrice, state.quote?.targetNotionalPrice)
  const stop = state.orderType === FLASH_STOP_ORDER_TYPE
  const triggerDeltaLabel = delta === null ? '—' : `${delta >= 0 ? '+' : ''}${delta.toFixed(2)}%`
  const triggerHelp =
    delta === null
      ? stop
        ? 'Leave limit blank for a stop-market order'
        : `Quoted against ${state.targetAsset.symbol}/USD`
      : `${triggerDeltaLabel} from current price`

  const spentAsset = getTradeSpentAsset(state)
  const baseSteps = state.quote?.steps || buildVisualTradeSteps(spentAsset, false)
  const phase = operation?.phase || ''
  const completed = new Set(['wrap', 'approve', 'sign', 'submit'].slice(0, completedStepCount[phase] || 0))
  if (operation?.status === 'succeeded') completed.add('submit')
  const pendingKind = pendingStepKinds[phase] || ''
  const failedKind = phase.endsWith('_failed') ? phase.slice(0, -'_failed'.length) : ''
  const steps = baseSteps.map((step) => ({
    id: step.id,
    label: step.label,
    status: completed.has(step.kind)
      ? ('complete' as const)
      : pendingKind === step.kind
        ? ('pending' as const)
        : failedKind === step.kind
          ? ('error' as const)
          : step.status
  }))

  const nextAction =
    execution.state.phase === 'awaiting_approval'
      ? 'approve'
      : execution.state.phase === 'awaiting_submit'
        ? 'sign'
        : state.quote?.nextAction
  const actionEnabled = Boolean(
    state.quote && state.quoteId && execution.canSubmit && !state.quoteLoading && !tradeValidationError
  )
  const actionLabel = state.quoteLoading
    ? 'Getting quote'
    : execution.state.phase === 'submitting'
      ? 'Submitting'
      : nextAction === 'wrap'
        ? state.quote?.actions?.wrap?.label || 'Wrap'
        : nextAction === 'approve'
          ? state.quote?.actions?.approval?.label || 'Approve'
          : state.quote
            ? 'Review/sign'
            : 'Enter details'
  const quote = state.quote
  const estimatedImpact = getEstimatedTradePriceImpact(quote)

  const model: TradeViewModel = {
    action: {
      enabled: actionEnabled,
      label: tradeValidationError && quote ? 'Adjust order' : actionLabel
    },
    networks,
    networksMeta,
    progress: {
      status: operationStatuses[execution.state.phase] || (state.quoteLoading ? 'Getting quote' : ''),
      steps
    },
    quote: quote
      ? {
          estimatedFeeLabel: quote.estimatedFeeNotional
            ? formatTradeNotional(quote.estimatedFeeNotional)
            : '—',
          estimatedImpactDanger: estimatedImpact !== null && estimatedImpact > 1,
          estimatedImpactLabel: estimatedImpact === null ? '—' : `${estimatedImpact.toFixed(2)}%`,
          outputAmountLabel: `${quote.outputAmount} ${quote.receiveAsset.symbol}`,
          outputNotionalLabel: `~${formatTradeNotional(quote.outputNotional)}`,
          targetPriceLabel: quote.targetNotionalPrice ? formatTradeNotional(quote.targetNotionalPrice) : '',
          targetPricePairLabel: quote.targetNotionalPrice ? `${quote.targetAsset.symbol}/USD` : ''
        }
      : null,
    ticket: {
      advancedOpen: state.advancedOpen,
      contra,
      durationDays: state.durationDays,
      durationHours: state.durationHours,
      durationMinutes: state.durationMinutes,
      expireTime: state.expireTime,
      limitNotionalPrice: state.limitNotionalPrice,
      maxPriceImpact: state.maxPriceImpact,
      minimumDateTime: localDateTimeValue(),
      orderType: state.orderType,
      side: state.side,
      slippage: state.slippage,
      startTime: state.startTime,
      target,
      timeInForce: state.timeInForce,
      triggerDeltaLabel,
      triggerHelp,
      triggerNotionalPrice: state.triggerNotionalPrice,
      twapBucketCount: state.twapBucketCount
    },
    validation: {
      error: state.error || operationError || tradeValidationError,
      invalidFields
    }
  }

  const events: TradeViewEvents = {
    onAssetOpenChange: (field, open) => dispatch({ type: 'setAssetOpen', field, open }),
    onBalancePercentChange: (field, percentValue) => {
      const asset = field === 'target' ? state.targetAsset : state.contraAsset
      const balance = tradeBalanceIndex.get(getTradeAssetKey(asset))
      const rawBalance = toBigInt(balance?.balance || 0) || 0n
      const percent = Math.min(100, Math.max(0, Number.isFinite(percentValue) ? percentValue : 0))
      const basisPoints = BigInt(Math.round(percent * 100))
      const amount = (rawBalance * basisPoints) / 10_000n
      dispatch({
        type: 'setInputAmount',
        inputAmount: amount > 0n ? formatUnits(amount, asset.decimals) : ''
      })
    },
    onClose: () => {
      execution.reset()
      void capability.close()
    },
    onInputAmountChange: (inputAmount) => dispatch({ type: 'setInputAmount', inputAmount }),
    onOrderFieldChange: (field, value) => dispatch({ type: 'setOrderField', field, value }),
    onOrderTypeChange: (orderType) => dispatch({ type: 'setOrderType', orderType }),
    onReview: () => execution.submit({ quote: state.quote, quoteId: state.quoteId }),
    onSelectAsset: (field, assetId) => {
      const asset = state.assetOptions.find((option) => getTradeAssetKey(option) === assetId)
      if (asset) dispatch({ type: 'selectAsset', field, asset })
    },
    onShowMoreAssets: (field) =>
      setAssetRowsVisible((rows) => ({
        ...rows,
        [field]: rows[field] + TOKEN_SELECTOR_ROWS_INCREMENT
      })),
    onSlippageChange: (slippage) => dispatch({ type: 'settingsChanged', slippage }),
    onTimeInForceChange: (timeInForce) => {
      dispatch({ type: 'setOrderField', field: 'timeInForce', value: timeInForce })
      if (timeInForce === 'gtt' && !state.expireTime) {
        const expiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        dispatch({ type: 'setOrderField', field: 'expireTime', value: localDateTimeValue(expiry) })
      }
    },
    onToggleAdvanced: () => dispatch({ type: 'toggleAdvancedOpen' }),
    onToggleSide: () => dispatch({ type: 'toggleSide' })
  }

  return { events, model }
}
