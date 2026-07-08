import { NATIVE_CURRENCY } from '../../../resources/constants'
import { type BalanceSummary } from '../../../resources/domain/balance'
import {
  FLASH_BRACKET_ORDER_TYPE,
  FLASH_LIMIT_ORDER_TYPE,
  FLASH_MARKET_ORDER_TYPE,
  FLASH_P0_ASSETS,
  FLASH_STOP_LOSS_ORDER_TYPE,
  FLASH_STOP_ORDER_TYPE,
  FLASH_TAKE_PROFIT_ORDER_TYPE,
  FLASH_TWAP_ORDER_TYPE,
  getReceiveAsset,
  getSpentAsset,
  type FlashAsset,
  type FlashOrderType,
  type FlashQuote,
  type FlashQuoteAction,
  type FlashQuoteTransactionRequest,
  type FlashStep,
  type FlashTradeSide
} from '../../../resources/domain/flash'
import { internalDappOriginId } from '../dappOrigin'

export const TRADE_DEFAULT_SLIPPAGE = '0.50'
export const TRADE_LIMIT_ORDER_TYPES: FlashOrderType[] = [
  FLASH_LIMIT_ORDER_TYPE,
  FLASH_STOP_ORDER_TYPE,
  FLASH_STOP_LOSS_ORDER_TYPE,
  FLASH_TAKE_PROFIT_ORDER_TYPE,
  FLASH_BRACKET_ORDER_TYPE
]
export const TRADE_ORDER_LABELS: Record<FlashOrderType, string> = {
  [FLASH_MARKET_ORDER_TYPE]: 'Market',
  [FLASH_LIMIT_ORDER_TYPE]: 'Limit',
  [FLASH_TWAP_ORDER_TYPE]: 'TWAP',
  [FLASH_STOP_ORDER_TYPE]: 'Stop',
  [FLASH_STOP_LOSS_ORDER_TYPE]: 'Stop Loss',
  [FLASH_TAKE_PROFIT_ORDER_TYPE]: 'Take Profit',
  [FLASH_BRACKET_ORDER_TYPE]: 'Bracket'
}

const TRADE_VISUAL_USD_RATES: Record<string, number> = {
  ETH: 2400,
  WETH: 2400,
  USDC: 1
}

export type TradePendingAction = '' | 'quote' | FlashStep['kind']
export type TradeReviewAction = '' | 'wrap' | 'approve' | 'sign'

export interface MarketTradeQuoteRequest {
  accountAddress: string
  chainId: number
  contraAsset: FlashAsset
  contraChain: number
  inputAmount: string
  orderType: typeof FLASH_MARKET_ORDER_TYPE
  qty: string
  quickTrade?: true
  side: FlashTradeSide
  slippage?: string
  targetAsset: FlashAsset
  targetChain: number
}

export interface ProviderSendPayload {
  _origin: string
  chainId: string
  id: number
  jsonrpc: '2.0'
  method: 'eth_sendTransaction' | 'eth_signTypedData_v4'
  params: unknown[]
}

export function isSameFlashAsset(a?: FlashAsset | null, b?: FlashAsset | null) {
  return !!a && !!b && (a.id === b.id || a.symbol === b.symbol)
}

export function cleanTradeAmount(amount = '') {
  return amount.trim().replace(/,/g, '')
}

export function tradeAmountNumber(amount = '') {
  const parsed = Number(cleanTradeAmount(amount))

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

export function formatTradeAmount(amount: number, asset: FlashAsset) {
  if (!Number.isFinite(amount) || amount <= 0) return ''

  const decimals = asset.symbol === 'USDC' ? 2 : 6

  return amount
    .toFixed(decimals)
    .replace(/\.?0+$/, '')
    .replace(/^\./, '0.')
}

export function buildVisualTradeSteps(spentAsset: FlashAsset, orderType: FlashOrderType, hasQuote: boolean) {
  const status = hasQuote ? 'required' : 'idle'
  const orderNoun = orderType === FLASH_MARKET_ORDER_TYPE ? 'trade' : 'order'
  const steps: FlashStep[] = []

  if (spentAsset.isNative) {
    steps.push({
      id: 'wrap',
      kind: 'wrap',
      label: `Wrap ${spentAsset.symbol}`,
      status,
      asset: spentAsset
    })
  } else {
    steps.push({
      id: 'approve',
      kind: 'approve',
      label: `Approve ${spentAsset.symbol}`,
      status,
      asset: spentAsset
    })
  }

  steps.push(
    {
      id: 'sign',
      kind: 'sign',
      label: orderType === FLASH_MARKET_ORDER_TYPE ? 'Sign quote' : 'Sign order',
      status
    },
    {
      id: 'submit',
      kind: 'submit',
      label: `Submit ${orderNoun}`,
      status
    }
  )

  return steps
}

export function simulateVisualTradeQuote({
  side,
  orderType,
  targetAsset,
  contraAsset,
  inputAmount
}: {
  side: FlashTradeSide
  orderType: FlashOrderType
  targetAsset: FlashAsset
  contraAsset: FlashAsset
  inputAmount: string
}): FlashQuote | null {
  const spentAsset = getSpentAsset({ side, targetAsset, contraAsset })
  const receiveAsset = getReceiveAsset({ side, targetAsset, contraAsset })
  const amount = tradeAmountNumber(inputAmount)

  if (!amount) return null

  const spentUsdRate = TRADE_VISUAL_USD_RATES[spentAsset.symbol] || 1
  const receiveUsdRate = TRADE_VISUAL_USD_RATES[receiveAsset.symbol] || 1
  const outputAmount = (amount * spentUsdRate * 0.9992) / receiveUsdRate
  const output = formatTradeAmount(outputAmount, receiveAsset)
  const rate = formatTradeAmount(spentUsdRate / receiveUsdRate, receiveAsset)

  return {
    id: `${side}-${orderType}-${spentAsset.id}-${receiveAsset.id}-${inputAmount}`,
    side,
    orderType,
    targetAsset,
    contraAsset,
    spentAsset,
    receiveAsset,
    inputAmount,
    outputAmount: output,
    rate: `1 ${spentAsset.symbol} = ${rate || '0'} ${receiveAsset.symbol}`,
    fees: [
      {
        label: 'Visual fee',
        amount: formatTradeAmount(amount * 0.0008, spentAsset),
        asset: spentAsset
      }
    ],
    steps: buildVisualTradeSteps(spentAsset, orderType, true)
  }
}

export function objectRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {}
}

export function nestedRecord(value: unknown, path: string[]) {
  return path.reduce<unknown>((current, key) => objectRecord(current)[key], value)
}

export function tradeErrorMessage(error: unknown, fallback: string) {
  const record = objectRecord(error)

  if (!error) return fallback
  if (typeof error === 'string') return error
  if (typeof record.message === 'string') return record.message
  if (typeof objectRecord(record.error).message === 'string') return objectRecord(record.error).message

  return fallback
}

export function providerResponseError(response: unknown) {
  const error = objectRecord(response).error

  return error ? tradeErrorMessage(error, 'Transaction failed.') : ''
}

export function normalizeTradeChainId(chainId: unknown) {
  const value =
    typeof chainId === 'string'
      ? Number.parseInt(chainId, chainId.toLowerCase().startsWith('0x') ? 16 : 10)
      : Number(chainId)

  if (!Number.isInteger(value) || value <= 0) throw new Error('Invalid Flash chain id')

  return value
}

export function tradeChainIdHex(chainId: unknown) {
  return `0x${normalizeTradeChainId(chainId).toString(16)}`
}

export function withTradeStepStatus(
  quote: FlashQuote | null,
  kind: FlashStep['kind'],
  status: FlashStep['status'],
  details: Partial<FlashStep> = {}
) {
  if (!quote) return quote

  return {
    ...quote,
    steps: quote.steps.map((step) => (step.kind === kind ? { ...step, ...details, status } : step))
  }
}

export function getTradeStepStatus(quote: FlashQuote | null, kind: FlashStep['kind']) {
  return quote?.steps.find((step) => step.kind === kind)?.status || ''
}

export function getNextTradeAction({
  orderType,
  quote
}: {
  orderType: FlashOrderType
  quote: FlashQuote | null
}): TradeReviewAction {
  if (orderType !== FLASH_MARKET_ORDER_TYPE || !quote) return ''
  if (quote.actions?.wrap && getTradeStepStatus(quote, 'wrap') !== 'complete') return 'wrap'
  if (quote.actions?.approval && getTradeStepStatus(quote, 'approve') !== 'complete') return 'approve'
  if (getTradeStepStatus(quote, 'sign') !== 'complete') return 'sign'

  return ''
}

export function getTradePrimaryLabel({
  orderType,
  pendingAction,
  quote,
  quoteLoading,
  submitting
}: {
  orderType: FlashOrderType
  pendingAction: TradePendingAction
  quote: FlashQuote | null
  quoteLoading: boolean
  submitting: boolean
}) {
  if (orderType !== FLASH_MARKET_ORDER_TYPE) return 'Unavailable in visual preview'
  if (submitting || pendingAction === 'submit') return 'Submitting'
  if (quoteLoading || pendingAction === 'quote') return 'Getting quote'

  const action = pendingAction || getNextTradeAction({ orderType, quote })

  if (action === 'wrap') return quote?.actions?.wrap?.label || 'Wrap'
  if (action === 'approve') return quote?.actions?.approval?.label || 'Approve'
  if (action === 'sign') return 'Review/sign'

  return quote ? 'Review/sign' : 'Enter amount'
}

export function canReviewTrade({
  orderType,
  pendingAction,
  quote,
  quoteLoading,
  submitting
}: {
  orderType: FlashOrderType
  pendingAction: TradePendingAction
  quote: FlashQuote | null
  quoteLoading: boolean
  submitting: boolean
}) {
  return (
    orderType === FLASH_MARKET_ORDER_TYPE &&
    !!quote &&
    !!getNextTradeAction({ orderType, quote }) &&
    !pendingAction &&
    !quoteLoading &&
    !submitting
  )
}

export function getFlashOrderTypedData(quote: FlashQuote | null, flashPayload: unknown) {
  const quoteRaw = objectRecord(quote?.raw)

  return (
    nestedRecord(flashPayload, ['actions', 'evm', 'orderTypedData']) ||
    nestedRecord(flashPayload, ['evm', 'orderTypedData']) ||
    nestedRecord(flashPayload, ['orderTypedData']) ||
    nestedRecord(quoteRaw, ['actions', 'evm', 'orderTypedData']) ||
    nestedRecord(quoteRaw, ['evm', 'orderTypedData']) ||
    nestedRecord(quoteRaw, ['orderTypedData'])
  )
}

export function getMarketTradeOptionalFields({
  quickTrade,
  slippage
}: {
  quickTrade: boolean
  slippage: string
}) {
  const optionalFields: Pick<MarketTradeQuoteRequest, 'quickTrade' | 'slippage'> = {}
  const cleanSlippage = String(slippage || '').trim()

  if (quickTrade) optionalFields.quickTrade = true
  if (cleanSlippage && cleanSlippage !== TRADE_DEFAULT_SLIPPAGE) optionalFields.slippage = cleanSlippage

  return optionalFields
}

export function buildMarketTradeQuoteRequest({
  accountAddress,
  contraAsset,
  inputAmount,
  quickTrade,
  side,
  slippage,
  targetAsset
}: {
  accountAddress?: string
  contraAsset: FlashAsset
  inputAmount: string
  quickTrade: boolean
  side: FlashTradeSide
  slippage: string
  targetAsset: FlashAsset
}): MarketTradeQuoteRequest | null {
  const qty = cleanTradeAmount(inputAmount)

  if (!tradeAmountNumber(qty)) return null
  if (!accountAddress) throw new Error('Select an account to trade.')

  const chainId = targetAsset.chainId || contraAsset.chainId

  return {
    accountAddress,
    chainId,
    contraAsset,
    contraChain: chainId,
    inputAmount: qty,
    orderType: FLASH_MARKET_ORDER_TYPE,
    qty,
    side,
    targetAsset,
    targetChain: chainId,
    ...getMarketTradeOptionalFields({ quickTrade, slippage })
  }
}

export function marketTradeQuoteRequestKey(request: MarketTradeQuoteRequest) {
  return JSON.stringify([
    request.accountAddress,
    request.chainId,
    request.side,
    request.orderType,
    request.targetAsset?.id,
    request.contraAsset?.id,
    request.qty,
    request.slippage,
    request.quickTrade
  ])
}

export function findTradeBalance(asset: FlashAsset, balances: BalanceSummary[]) {
  return balances.find((balance) => {
    const symbolMatches = (balance.symbol || '').toUpperCase() === asset.symbol
    const chainMatches = Number(balance.chainId) === asset.chainId
    const balanceAddress = (balance.address || '').toLowerCase()
    const assetAddress = (asset.address || '').toLowerCase()
    const nativeMatches = asset.isNative
      ? balanceAddress === NATIVE_CURRENCY
      : balanceAddress === assetAddress

    return symbolMatches && chainMatches && nativeMatches
  })
}

export function getFlashBalanceEntries(
  balances: BalanceSummary[],
  assets: readonly FlashAsset[] = FLASH_P0_ASSETS
) {
  return assets.map((asset) => {
    const balance = findTradeBalance(asset, balances)

    return {
      id: asset.id,
      assetId: asset.id,
      symbol: asset.symbol,
      balance: balance?.balance || '0'
    }
  })
}

export function buildTradeTransactionPayload({
  accountAddress,
  id = Date.now(),
  originId = internalDappOriginId,
  tx
}: {
  accountAddress: string
  id?: number
  originId?: string
  tx?: FlashQuoteTransactionRequest | null
}) {
  if (!accountAddress || !tx?.to) {
    throw new Error('Flash action is missing a transaction request.')
  }

  const chainIdNumber = normalizeTradeChainId(tx.chainId)
  const chainId = tradeChainIdHex(tx.chainId)
  const payload: ProviderSendPayload = {
    id,
    jsonrpc: '2.0',
    method: 'eth_sendTransaction',
    chainId,
    params: [
      {
        ...tx,
        chainId,
        from: tx.from || accountAddress,
        value: tx.value || '0x0'
      }
    ],
    _origin: originId
  }

  return { chainIdNumber, payload }
}

export function buildTradeActionPayload({
  accountAddress,
  action,
  id,
  originId
}: {
  accountAddress: string
  action?: FlashQuoteAction | null
  id?: number
  originId?: string
}) {
  return buildTradeTransactionPayload({
    accountAddress,
    id,
    originId,
    tx: action?.tx
  })
}

export function buildTradeSignaturePayload({
  accountAddress,
  flashPayload,
  id = Date.now(),
  originId = internalDappOriginId,
  quote
}: {
  accountAddress: string
  flashPayload: unknown
  id?: number
  originId?: string
  quote: FlashQuote | null
}) {
  const typedData = getFlashOrderTypedData(quote, flashPayload)

  if (!accountAddress || !quote || !typedData) {
    throw new Error('Flash quote is missing order typed data.')
  }

  const typedDataDomain = objectRecord(objectRecord(typedData).domain)
  const chainIdNumber = normalizeTradeChainId(typedDataDomain.chainId || quote.targetAsset.chainId)
  const chainId = tradeChainIdHex(chainIdNumber)
  const payload: ProviderSendPayload = {
    id,
    jsonrpc: '2.0',
    method: 'eth_signTypedData_v4',
    chainId,
    params: [accountAddress, JSON.stringify(typedData)],
    _origin: originId
  }

  return { chainIdNumber, payload }
}

export function buildTradeSubmitRequest({
  accountAddress,
  flashPayload,
  quickTrade,
  quote,
  signature,
  slippage
}: {
  accountAddress: string
  flashPayload: unknown
  quickTrade: boolean
  quote: FlashQuote
  signature: string
  slippage: string
}) {
  const chainId = quote.targetAsset.chainId || quote.contraAsset.chainId
  const rawPayload = flashPayload || quote.raw || null

  return {
    accountAddress,
    chainId,
    contraAsset: quote.contraAsset,
    contraChain: chainId,
    inputAmount: quote.inputAmount,
    orderSignature: signature,
    orderType: quote.orderType,
    qty: quote.inputAmount,
    quote,
    quoteId: quote.id || objectRecord(rawPayload).quoteId,
    rawPayload,
    side: quote.side,
    signature,
    targetAsset: quote.targetAsset,
    targetChain: chainId,
    ...getMarketTradeOptionalFields({ quickTrade, slippage })
  }
}
