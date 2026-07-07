import { resolveFlashAssetFromRouteAssetId } from '../../../resources/domain/dappLauncher'
import {
  FLASH_MARKET_ORDER_TYPE,
  FLASH_P0_ASSETS,
  getDefaultContraAsset,
  getDefaultSide,
  getSpentAsset,
  type FlashAsset,
  type FlashAssetBalances,
  type FlashOrderType,
  type FlashQuote,
  type FlashStep,
  type FlashTradeSide
} from '../../../resources/domain/flash'
import {
  isSameFlashAsset,
  simulateVisualTradeQuote,
  TRADE_DEFAULT_SLIPPAGE,
  tradeAmountNumber,
  type TradePendingAction,
  withTradeStepStatus
} from './tradeTransaction'

export interface TradeWorkflowState {
  actionQuoteId: string
  advancedOpen: boolean
  contraAsset: FlashAsset
  contraAmount: string
  contraOpen: boolean
  error: string
  flashPayload: unknown
  orderType: FlashOrderType
  pendingAction: TradePendingAction
  quickTrade: boolean
  quote: FlashQuote | null
  quoteLoading: boolean
  quoteRequestKey: string
  side: FlashTradeSide
  signature: string
  slippage: string
  status: string
  submitting: boolean
  targetAsset: FlashAsset
  targetAmount: string
  targetOpen: boolean
}

export type TradeAssetField = 'target' | 'contra'

export type TradeWorkflowAction =
  | { type: 'accountChanged' }
  | { type: 'actionFailed'; actionQuoteId: string; error: string; stepKind: FlashStep['kind'] }
  | {
      type: 'actionStarted'
      actionQuoteId: string
      stepKind: FlashStep['kind']
      status: string
    }
  | {
      type: 'actionSucceeded'
      actionQuoteId: string
      stepKind: FlashStep['kind']
      txHash?: string
    }
  | { type: 'quoteBuildFailed'; error: string }
  | { type: 'quoteCleared' }
  | { type: 'quoteFailed'; error: string; requestKey: string }
  | {
      type: 'quoteSucceeded'
      flashPayload: unknown
      quote: FlashQuote
      requestKey: string
    }
  | { type: 'quoteRequested'; requestKey: string }
  | { type: 'selectAsset'; asset: FlashAsset; field: TradeAssetField }
  | { type: 'setInputAmount'; inputAmount: string }
  | { type: 'setOrderType'; orderType: FlashOrderType }
  | { type: 'settingsChanged'; quickTrade?: boolean; slippage?: string }
  | { type: 'signatureSucceeded'; actionQuoteId: string; signature: string }
  | { type: 'stepFailed'; error: string; stepKind: FlashStep['kind'] }
  | { type: 'submitFailed'; actionQuoteId: string; error: string }
  | { type: 'submitStarted'; actionQuoteId: string }
  | { type: 'submitSucceeded'; actionQuoteId: string }
  | { type: 'toggleAdvancedOpen' }
  | { type: 'toggleAssetOpen'; field: TradeAssetField }
  | { type: 'toggleSide' }

export interface CreateInitialTradeStateOptions {
  assetId?: string | null
  balances?: FlashAssetBalances | null
}

function resolveContraAsset(targetAsset: FlashAsset, balances?: FlashAssetBalances | null) {
  const contraAsset = getDefaultContraAsset({ targetAsset, balances })

  if (!isSameFlashAsset(targetAsset, contraAsset)) return contraAsset

  const fallback = getDefaultContraAsset({ targetAsset })

  return isSameFlashAsset(targetAsset, fallback)
    ? FLASH_P0_ASSETS.find((option) => !isSameFlashAsset(option, targetAsset)) || contraAsset
    : fallback
}

export function createInitialTradeState({
  assetId,
  balances
}: CreateInitialTradeStateOptions = {}): TradeWorkflowState {
  const targetAsset = resolveFlashAssetFromRouteAssetId(assetId)

  return {
    actionQuoteId: '',
    advancedOpen: false,
    contraAsset: resolveContraAsset(targetAsset, balances),
    contraAmount: '',
    contraOpen: false,
    error: '',
    flashPayload: null,
    orderType: FLASH_MARKET_ORDER_TYPE,
    pendingAction: '',
    quickTrade: false,
    quote: null,
    quoteLoading: false,
    quoteRequestKey: '',
    side: getDefaultSide({ targetAsset, balances }),
    signature: '',
    slippage: TRADE_DEFAULT_SLIPPAGE,
    status: '',
    submitting: false,
    targetAsset,
    targetAmount: '',
    targetOpen: false
  }
}

export function getTradeInputAmount(state: TradeWorkflowState) {
  return state.side === 'buy' ? state.contraAmount : state.targetAmount
}

export function getTradeSpentAsset(state: TradeWorkflowState) {
  return getSpentAsset({
    side: state.side,
    targetAsset: state.targetAsset,
    contraAsset: state.contraAsset
  })
}

function tradeHasValidInput(state: TradeWorkflowState) {
  return !!tradeAmountNumber(getTradeInputAmount(state))
}

function applyTradeInputAmount(
  state: TradeWorkflowState,
  inputAmount: string,
  nextState: Partial<TradeWorkflowState> = {}
): TradeWorkflowState {
  const merged = { ...state, ...nextState }
  const { side, orderType, targetAsset, contraAsset } = merged

  if (orderType === FLASH_MARKET_ORDER_TYPE) {
    return {
      ...merged,
      actionQuoteId: '',
      contraAmount: side === 'buy' ? inputAmount : '',
      error: '',
      flashPayload: null,
      pendingAction: '',
      quote: null,
      quoteLoading: false,
      quoteRequestKey: '',
      signature: '',
      status: '',
      submitting: false,
      targetAmount: side === 'sell' ? inputAmount : ''
    }
  }

  const quote = simulateVisualTradeQuote({
    side,
    orderType,
    targetAsset,
    contraAsset,
    inputAmount
  })

  return {
    ...merged,
    actionQuoteId: '',
    contraAmount: side === 'buy' ? inputAmount : quote?.outputAmount || '',
    error: '',
    flashPayload: null,
    pendingAction: '',
    quote,
    quoteLoading: false,
    quoteRequestKey: '',
    signature: '',
    status: '',
    submitting: false,
    targetAmount: side === 'sell' ? inputAmount : quote?.outputAmount || ''
  }
}

function clearQuoteIfNeeded(state: TradeWorkflowState): TradeWorkflowState {
  if (
    !state.actionQuoteId &&
    !state.error &&
    !state.flashPayload &&
    !state.pendingAction &&
    !state.quote &&
    !state.quoteLoading &&
    !state.quoteRequestKey &&
    !state.signature &&
    !state.status
  ) {
    return state
  }

  return {
    ...state,
    actionQuoteId: '',
    error: '',
    flashPayload: null,
    pendingAction: '',
    quote: null,
    quoteLoading: false,
    quoteRequestKey: '',
    signature: '',
    status: ''
  }
}

function selectTradeAsset(state: TradeWorkflowState, field: TradeAssetField, asset: FlashAsset) {
  const targetAsset = field === 'target' ? asset : state.targetAsset
  let contraAsset = field === 'contra' ? asset : state.contraAsset

  if (isSameFlashAsset(targetAsset, contraAsset)) {
    const replacement = getDefaultContraAsset({ targetAsset })
    contraAsset = isSameFlashAsset(targetAsset, replacement)
      ? FLASH_P0_ASSETS.find((option) => !isSameFlashAsset(option, targetAsset)) || contraAsset
      : replacement
  }

  return applyTradeInputAmount(state, getTradeInputAmount(state), {
    contraAsset,
    contraOpen: false,
    targetAsset,
    targetOpen: false
  })
}

function refreshForSettings(
  state: TradeWorkflowState,
  nextState: Partial<TradeWorkflowState>
): TradeWorkflowState {
  const merged: TradeWorkflowState = {
    ...state,
    ...nextState,
    error: '',
    status: ''
  }

  if (merged.orderType !== FLASH_MARKET_ORDER_TYPE) return merged
  if (!tradeHasValidInput(merged)) return clearQuoteIfNeeded(merged)

  return {
    ...merged,
    actionQuoteId: '',
    flashPayload: null,
    pendingAction: 'quote',
    quoteLoading: true,
    quoteRequestKey: '',
    signature: '',
    status: 'Getting quote'
  }
}

export function tradeReducer(state: TradeWorkflowState, action: TradeWorkflowAction): TradeWorkflowState {
  switch (action.type) {
    case 'accountChanged':
      if (state.orderType !== FLASH_MARKET_ORDER_TYPE) {
        return {
          ...state,
          actionQuoteId: '',
          flashPayload: null,
          pendingAction: '',
          signature: '',
          submitting: false
        }
      }

      return {
        ...state,
        actionQuoteId: '',
        error: '',
        flashPayload: null,
        pendingAction: tradeHasValidInput(state) ? 'quote' : '',
        quote: null,
        quoteLoading: tradeHasValidInput(state),
        quoteRequestKey: '',
        signature: '',
        status: tradeHasValidInput(state) ? 'Getting quote' : '',
        submitting: false
      }
    case 'actionFailed':
      if (state.actionQuoteId !== action.actionQuoteId) return state

      return {
        ...state,
        actionQuoteId: '',
        error: action.error,
        pendingAction: '',
        quote: withTradeStepStatus(state.quote, action.stepKind, 'error', { error: action.error }),
        status: ''
      }
    case 'actionStarted':
      return {
        ...state,
        actionQuoteId: action.actionQuoteId,
        error: '',
        pendingAction: action.stepKind,
        quote: withTradeStepStatus(state.quote, action.stepKind, 'pending', { error: undefined }),
        status: action.status
      }
    case 'actionSucceeded':
      if (state.actionQuoteId !== action.actionQuoteId) return state

      return {
        ...state,
        error: '',
        pendingAction: '',
        quote: withTradeStepStatus(state.quote, action.stepKind, 'complete', {
          error: undefined,
          txHash: action.txHash
        }),
        status: ''
      }
    case 'quoteBuildFailed':
      return {
        ...state,
        actionQuoteId: '',
        error: action.error,
        flashPayload: null,
        pendingAction: '',
        quote: null,
        quoteLoading: false,
        quoteRequestKey: '',
        signature: '',
        status: ''
      }
    case 'quoteCleared':
      return clearQuoteIfNeeded(state)
    case 'quoteFailed':
      if (state.quoteRequestKey !== action.requestKey) return state

      return {
        ...state,
        actionQuoteId: '',
        error: action.error,
        flashPayload: null,
        pendingAction: '',
        quote: null,
        quoteLoading: false,
        status: ''
      }
    case 'quoteRequested':
      return {
        ...state,
        actionQuoteId: '',
        error: '',
        flashPayload: null,
        pendingAction: 'quote',
        quoteLoading: true,
        quoteRequestKey: action.requestKey,
        signature: '',
        status: 'Getting quote'
      }
    case 'quoteSucceeded':
      if (state.quoteRequestKey !== action.requestKey) return state

      return {
        ...state,
        actionQuoteId: '',
        contraAmount: action.quote.side === 'buy' ? action.quote.inputAmount : action.quote.outputAmount,
        error: '',
        flashPayload: action.flashPayload,
        pendingAction: '',
        quote: action.quote,
        quoteLoading: false,
        signature: '',
        status: '',
        targetAmount: action.quote.side === 'sell' ? action.quote.inputAmount : action.quote.outputAmount
      }
    case 'selectAsset':
      return selectTradeAsset(state, action.field, action.asset)
    case 'setInputAmount':
      return applyTradeInputAmount(state, action.inputAmount)
    case 'setOrderType':
      return applyTradeInputAmount(state, getTradeInputAmount(state), {
        orderType: action.orderType
      })
    case 'settingsChanged':
      return refreshForSettings(state, {
        ...(typeof action.quickTrade === 'boolean' ? { quickTrade: action.quickTrade } : {}),
        ...(typeof action.slippage === 'string' ? { slippage: action.slippage } : {})
      })
    case 'signatureSucceeded':
      if (state.actionQuoteId !== action.actionQuoteId) return state

      return {
        ...state,
        error: '',
        pendingAction: '',
        quote: withTradeStepStatus(state.quote, 'sign', 'complete', { error: undefined }),
        signature: action.signature,
        status: ''
      }
    case 'stepFailed':
      return {
        ...state,
        actionQuoteId: '',
        error: action.error,
        pendingAction: '',
        quote: withTradeStepStatus(state.quote, action.stepKind, 'error', { error: action.error }),
        status: ''
      }
    case 'submitFailed':
      if (state.actionQuoteId !== action.actionQuoteId) return state

      return {
        ...state,
        actionQuoteId: '',
        error: action.error,
        pendingAction: '',
        quote: withTradeStepStatus(
          withTradeStepStatus(state.quote, 'submit', 'error', { error: action.error }),
          'sign',
          'required',
          { error: undefined }
        ),
        signature: '',
        status: '',
        submitting: false
      }
    case 'submitStarted':
      return {
        ...state,
        actionQuoteId: action.actionQuoteId,
        error: '',
        pendingAction: 'submit',
        quote: withTradeStepStatus(state.quote, 'submit', 'pending', { error: undefined }),
        status: 'Submitting order',
        submitting: true
      }
    case 'submitSucceeded':
      if (state.actionQuoteId !== action.actionQuoteId) return state

      return {
        ...state,
        actionQuoteId: '',
        error: '',
        pendingAction: '',
        quote: withTradeStepStatus(state.quote, 'submit', 'complete', { error: undefined }),
        status: '',
        submitting: false
      }
    case 'toggleAdvancedOpen':
      return {
        ...state,
        advancedOpen: !state.advancedOpen
      }
    case 'toggleAssetOpen':
      return action.field === 'target'
        ? {
            ...state,
            contraOpen: false,
            targetOpen: !state.targetOpen
          }
        : {
            ...state,
            contraOpen: !state.contraOpen,
            targetOpen: false
          }
    case 'toggleSide':
      return applyTradeInputAmount(state, state.quote?.outputAmount || '', {
        side: state.side === 'buy' ? 'sell' : 'buy'
      })
    default:
      return state
  }
}
