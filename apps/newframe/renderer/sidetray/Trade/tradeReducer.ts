import { parseCanonicalAssetId, resolveFlashAssetFromRouteAssetId } from '../../../domain/sideTray'
import {
  FLASH_MARKET_ORDER_TYPE,
  FLASH_STOP_LOSS_ORDER_TYPE,
  FLASH_STOP_ORDER_TYPE,
  FLASH_TAKE_PROFIT_ORDER_TYPE
} from '../../../domain/flash/constants'
import {
  getFlashAssetsForChain,
  getFlashDefaultTargetAsset,
  toFlashApiAssetAddress
} from '../../../domain/flash/assets'
import {
  getDefaultContraAsset,
  getDefaultSide,
  getSpentAsset,
  isSameFlashAsset,
  type FlashAssetBalances
} from '../../../domain/flash/pair'
import { type FlashAsset, type FlashOrderType, type FlashTradeSide } from '../../../domain/flash/schemas'
import type { FlashQuoteDisplay } from '../../../contracts/operations'
import {
  TRADE_DEFAULT_DURATION_DAYS,
  TRADE_DEFAULT_DURATION_HOURS,
  TRADE_DEFAULT_DURATION_MINUTES,
  TRADE_DEFAULT_MAX_PRICE_IMPACT,
  TRADE_DEFAULT_SLIPPAGE,
  getTradeValidationError,
  tradeAmountNumber,
  type TradeOrderFields
} from './tradeTransaction'

export interface TradeWorkflowState {
  advancedOpen: boolean
  assetOptions: FlashAsset[]
  contraAsset: FlashAsset
  contraAmount: string
  contraOpen: boolean
  durationDays: string
  durationHours: string
  durationMinutes: string
  error: string
  expireTime: string
  limitNotionalPrice: string
  maxPriceImpact: string
  orderType: FlashOrderType
  quickTrade: boolean
  quote: FlashQuoteDisplay | null
  quoteId: string
  quoteLoading: boolean
  quoteRequestKey: string
  side: FlashTradeSide
  slippage: string
  startTime: string
  targetAsset: FlashAsset
  targetAmount: string
  targetOpen: boolean
  timeInForce: 'gtc' | 'gtt'
  triggerNotionalPrice: string
  twapBucketCount: string
}

export type TradeAssetField = 'target' | 'contra'

export type TradeWorkflowAction =
  | { type: 'accountChanged' }
  | { type: 'quoteBuildFailed'; error: string }
  | { type: 'quoteCleared' }
  | { type: 'quoteFailed'; error: string; requestKey: string }
  | {
      type: 'quoteSucceeded'
      quoteId: string
      quote: FlashQuoteDisplay
      requestKey: string
    }
  | { type: 'quoteRequested'; requestKey: string }
  | { type: 'selectAsset'; asset: FlashAsset; field: TradeAssetField }
  | { type: 'setAssetOpen'; field: TradeAssetField; open: boolean }
  | { type: 'setAssetOptions'; assets: FlashAsset[]; balances?: FlashAssetBalances | null }
  | { type: 'setInputAmount'; inputAmount: string }
  | { type: 'setOrderField'; field: keyof TradeOrderFields; value: string }
  | { type: 'setOrderType'; orderType: FlashOrderType }
  | { type: 'settingsChanged'; quickTrade?: boolean; slippage?: string }
  | { type: 'toggleAdvancedOpen' }
  | { type: 'toggleSide' }

export interface CreateInitialTradeStateOptions {
  assetId?: string | null
  assets?: FlashAsset[]
  balances?: FlashAssetBalances | null
  chainId?: number | null
}

function assetAddress(asset: FlashAsset) {
  return toFlashApiAssetAddress(asset).toLowerCase()
}

function findAssetByRouteId(assetId: string | null | undefined, assets: readonly FlashAsset[]) {
  const routeAsset = parseCanonicalAssetId(assetId)
  if (!routeAsset) return null

  return (
    assets.find((asset) => {
      return asset.chainId === routeAsset.chainId && assetAddress(asset) === routeAsset.address
    }) || null
  )
}

function defaultAssetForChain(chainId: number, assets: readonly FlashAsset[]) {
  const sameChain = assets.filter((asset) => asset.chainId === chainId)

  return (
    sameChain.find((asset) => asset.symbol.toUpperCase() === 'WETH') ||
    sameChain.find((asset) => !asset.isNative) ||
    sameChain[0] ||
    getFlashDefaultTargetAsset(chainId)
  )
}

function resolveTargetAsset({
  assetId,
  assets = [],
  chainId
}: {
  assetId?: string | null
  assets?: FlashAsset[]
  chainId?: number | null
}) {
  const routeAsset = findAssetByRouteId(assetId, assets)
  if (routeAsset) return routeAsset

  const parsedRoute = parseCanonicalAssetId(assetId)
  const fallbackChainId = parsedRoute?.chainId || chainId

  if (Number.isInteger(fallbackChainId) && Number(fallbackChainId) > 0) {
    const asset = defaultAssetForChain(Number(fallbackChainId), assets)
    if (asset) return asset
  }

  return resolveFlashAssetFromRouteAssetId(assetId, chainId)
}

function sameChainAssetOptions(targetAsset: FlashAsset, assets: readonly FlashAsset[]) {
  const sameChain = assets.filter((asset) => asset.chainId === targetAsset.chainId)

  return sameChain.length ? sameChain : getFlashAssetsForChain(targetAsset.chainId)
}

function resolveContraAsset(
  targetAsset: FlashAsset,
  balances?: FlashAssetBalances | null,
  assets: readonly FlashAsset[] = [],
  side?: FlashTradeSide
) {
  const contraAsset = getDefaultContraAsset({
    assets: sameChainAssetOptions(targetAsset, assets),
    targetAsset,
    balances,
    side
  })

  if (!isSameFlashAsset(targetAsset, contraAsset) && contraAsset.chainId === targetAsset.chainId) {
    return contraAsset
  }

  return (
    sameChainAssetOptions(targetAsset, assets).find((option) => !isSameFlashAsset(option, targetAsset)) ||
    contraAsset
  )
}

function resolveInitialTradePair({
  assetId,
  assets,
  balances,
  chainId
}: CreateInitialTradeStateOptions & { assets: FlashAsset[] }) {
  const preferredTarget = resolveTargetAsset({ assetId, assets, chainId })
  const explicitTarget = Boolean(parseCanonicalAssetId(assetId))

  if (explicitTarget) {
    const side = getDefaultSide({ targetAsset: preferredTarget, balances })

    return {
      contraAsset: resolveContraAsset(preferredTarget, balances, assets, side),
      side,
      targetAsset: preferredTarget
    }
  }

  const targetAsset = preferredTarget
  const contraAsset = resolveContraAsset(targetAsset, null, assets)

  return {
    contraAsset,
    side: getDefaultSide({ targetAsset, balances }),
    targetAsset
  }
}

export function createInitialTradeState({
  assetId,
  assets = [],
  balances,
  chainId
}: CreateInitialTradeStateOptions = {}): TradeWorkflowState {
  const { contraAsset, side, targetAsset } = resolveInitialTradePair({
    assetId,
    assets,
    balances,
    chainId
  })

  return {
    advancedOpen: false,
    assetOptions: assets,
    contraAsset,
    contraAmount: '',
    contraOpen: false,
    durationDays: TRADE_DEFAULT_DURATION_DAYS,
    durationHours: TRADE_DEFAULT_DURATION_HOURS,
    durationMinutes: TRADE_DEFAULT_DURATION_MINUTES,
    error: '',
    expireTime: '',
    limitNotionalPrice: '',
    maxPriceImpact: TRADE_DEFAULT_MAX_PRICE_IMPACT,
    orderType: FLASH_MARKET_ORDER_TYPE,
    quickTrade: false,
    quote: null,
    quoteId: '',
    quoteLoading: false,
    quoteRequestKey: '',
    side,
    slippage: TRADE_DEFAULT_SLIPPAGE,
    startTime: '',
    targetAsset,
    targetAmount: '',
    targetOpen: false,
    timeInForce: 'gtc',
    triggerNotionalPrice: '',
    twapBucketCount: ''
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

export function getTradeOrderFields(state: TradeWorkflowState): TradeOrderFields {
  return {
    durationDays: state.durationDays,
    durationHours: state.durationHours,
    durationMinutes: state.durationMinutes,
    expireTime: state.expireTime,
    limitNotionalPrice: state.limitNotionalPrice,
    maxPriceImpact: state.maxPriceImpact,
    startTime: state.startTime,
    timeInForce: state.timeInForce,
    triggerNotionalPrice: state.triggerNotionalPrice,
    twapBucketCount: state.twapBucketCount
  }
}

function tradeHasValidInput(state: TradeWorkflowState) {
  return (
    !!tradeAmountNumber(getTradeInputAmount(state)) &&
    !getTradeValidationError({
      ...getTradeOrderFields(state),
      inputAmount: getTradeInputAmount(state),
      orderType: state.orderType,
      side: state.side,
      slippage: state.slippage,
      targetAsset: state.targetAsset,
      contraAsset: state.contraAsset
    })
  )
}

function clearedExecutionState(quoteLoading = false) {
  return {
    error: '',
    quote: null,
    quoteId: '',
    quoteLoading,
    quoteRequestKey: ''
  }
}

function applyTradeInputAmount(
  state: TradeWorkflowState,
  inputAmount: string,
  nextState: Partial<TradeWorkflowState> = {}
): TradeWorkflowState {
  const merged = { ...state, ...nextState }
  const { side } = merged

  return {
    ...merged,
    ...clearedExecutionState(false),
    contraAmount: side === 'buy' ? inputAmount : '',
    targetAmount: side === 'sell' ? inputAmount : ''
  }
}

function clearQuoteIfNeeded(state: TradeWorkflowState): TradeWorkflowState {
  if (!state.error && !state.quote && !state.quoteId && !state.quoteLoading && !state.quoteRequestKey) {
    return state
  }

  return {
    ...state,
    ...clearedExecutionState(false)
  }
}

function withQuoteRefresh(state: TradeWorkflowState): TradeWorkflowState {
  if (!tradeHasValidInput(state)) return clearQuoteIfNeeded(state)

  return {
    ...state,
    error: '',
    quote: null,
    quoteId: '',
    quoteLoading: true,
    quoteRequestKey: ''
  }
}

function selectTradeAsset(state: TradeWorkflowState, field: TradeAssetField, asset: FlashAsset) {
  let targetAsset = field === 'target' ? asset : state.targetAsset
  let contraAsset = field === 'contra' ? asset : state.contraAsset

  if (isSameFlashAsset(targetAsset, contraAsset)) {
    if (field === 'target') {
      contraAsset = resolveContraAsset(targetAsset, null, state.assetOptions, state.side)
    } else {
      targetAsset = defaultAssetForChain(contraAsset.chainId, state.assetOptions)
    }
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
    error: ''
  }

  return withQuoteRefresh(merged)
}

function preserveEquivalentAsset(current: FlashAsset, candidate: FlashAsset) {
  return current.id === candidate.id &&
    current.symbol === candidate.symbol &&
    current.name === candidate.name &&
    current.decimals === candidate.decimals &&
    current.chainId === candidate.chainId &&
    current.isNative === candidate.isNative &&
    current.address === candidate.address
    ? current
    : candidate
}

function updateAssetOptions(
  state: TradeWorkflowState,
  assets: FlashAsset[],
  balances?: FlashAssetBalances | null
) {
  const targetCandidate =
    assets.find((asset) => isSameFlashAsset(asset, state.targetAsset)) ||
    defaultAssetForChain(state.targetAsset.chainId, assets)
  const targetAsset = preserveEquivalentAsset(state.targetAsset, targetCandidate)
  const contraCandidate =
    assets.find((asset) => isSameFlashAsset(asset, state.contraAsset)) ||
    resolveContraAsset(targetAsset, balances, assets, state.side)
  const contraAsset = preserveEquivalentAsset(state.contraAsset, contraCandidate)

  if (
    state.assetOptions === assets &&
    state.targetAsset === targetAsset &&
    state.contraAsset === contraAsset
  ) {
    return state
  }

  return {
    ...state,
    assetOptions: assets,
    contraAsset,
    targetAsset
  }
}

export function tradeReducer(state: TradeWorkflowState, action: TradeWorkflowAction): TradeWorkflowState {
  switch (action.type) {
    case 'accountChanged':
      return withQuoteRefresh({
        ...state,
        error: '',
        quote: null,
        quoteId: '',
        quoteLoading: false,
        quoteRequestKey: ''
      })
    case 'quoteBuildFailed':
      return {
        ...state,
        ...clearedExecutionState(false),
        error: action.error
      }
    case 'quoteCleared':
      return clearQuoteIfNeeded(state)
    case 'quoteFailed':
      if (state.quoteRequestKey !== action.requestKey) return state

      return {
        ...state,
        ...clearedExecutionState(false),
        error: action.error
      }
    case 'quoteRequested':
      return {
        ...state,
        error: '',
        quoteId: '',
        quoteLoading: true,
        quoteRequestKey: action.requestKey
      }
    case 'quoteSucceeded':
      if (state.quoteRequestKey !== action.requestKey) return state

      return {
        ...state,
        contraAmount: action.quote.side === 'buy' ? state.contraAmount : action.quote.outputAmount,
        error: '',
        quote: action.quote,
        quoteId: action.quoteId,
        quoteLoading: false,
        targetAmount: action.quote.side === 'sell' ? state.targetAmount : action.quote.outputAmount
      }
    case 'selectAsset':
      return selectTradeAsset(state, action.field, action.asset)
    case 'setAssetOpen':
      return action.field === 'target'
        ? {
            ...state,
            contraOpen: action.open ? false : state.contraOpen,
            targetOpen: action.open
          }
        : {
            ...state,
            contraOpen: action.open,
            targetOpen: action.open ? false : state.targetOpen
          }
    case 'setAssetOptions':
      return updateAssetOptions(state, action.assets, action.balances)
    case 'setInputAmount':
      return applyTradeInputAmount(state, action.inputAmount)
    case 'setOrderField':
      return refreshForSettings(state, {
        [action.field]: action.value
      } as Partial<TradeWorkflowState>)
    case 'setOrderType': {
      if (action.orderType === state.orderType) return state

      const side =
        action.orderType === FLASH_STOP_ORDER_TYPE
          ? 'buy'
          : [FLASH_STOP_LOSS_ORDER_TYPE, FLASH_TAKE_PROFIT_ORDER_TYPE].includes(action.orderType)
            ? 'sell'
            : state.side
      const inputAmount = side === state.side ? getTradeInputAmount(state) : ''

      return applyTradeInputAmount(state, inputAmount, {
        advancedOpen: false,
        orderType: action.orderType,
        side
      })
    }
    case 'settingsChanged':
      return refreshForSettings(state, {
        ...(typeof action.quickTrade === 'boolean' ? { quickTrade: action.quickTrade } : {}),
        ...(typeof action.slippage === 'string' ? { slippage: action.slippage } : {})
      })
    case 'toggleAdvancedOpen':
      return {
        ...state,
        advancedOpen: !state.advancedOpen
      }
    case 'toggleSide':
      if (
        [FLASH_STOP_ORDER_TYPE, FLASH_STOP_LOSS_ORDER_TYPE, FLASH_TAKE_PROFIT_ORDER_TYPE].includes(
          state.orderType
        )
      ) {
        return state
      }

      return applyTradeInputAmount(state, '', {
        side: state.side === 'buy' ? 'sell' : 'buy'
      })
    default:
      return state
  }
}
