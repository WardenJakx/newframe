import { NATIVE_CURRENCY } from '../../../resources/constants'
import { type BalanceSummary } from '../../../resources/domain/balance'
import {
  FLASH_BRACKET_ORDER_TYPE,
  FLASH_LIMIT_ORDER_TYPE,
  FLASH_MARKET_ORDER_TYPE,
  FLASH_STOP_LOSS_ORDER_TYPE,
  FLASH_STOP_ORDER_TYPE,
  FLASH_TAKE_PROFIT_ORDER_TYPE,
  FLASH_TWAP_ORDER_TYPE,
  balanceSummaryToFlashAsset,
  getFlashAssetsForChain,
  isFlashChainSupported,
  toFlashApiAssetAddress,
  type FlashAsset,
  type FlashOrderType,
  type FlashQuote,
  type FlashQuoteAction,
  type FlashQuoteTransactionRequest,
  type FlashRuntime,
  type FlashStep,
  type FlashTradeSide
} from '../../../resources/domain/flash'
import { internalDappOriginId } from '../dappOrigin'

export const TRADE_DEFAULT_SLIPPAGE = '0.50'
export const TRADE_DEFAULT_DURATION_SECONDS = '3600'
export const TRADE_DEFAULT_TWAP_BUCKETS = '6'
export const TRADE_MIN_DURATION_SECONDS = 600
export const TRADE_MAX_DURATION_SECONDS = 2_592_000
export const TRADE_MIN_TWAP_BUCKETS = 2
export const TRADE_MAX_TWAP_BUCKETS = 2_560

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

export type TradePendingAction = '' | 'quote' | FlashStep['kind']
export type TradeReviewAction = '' | 'wrap' | 'approve' | 'sign'

export interface TradeOrderFields {
  durationSeconds?: string
  limitNotionalPrice?: string
  stopLossNotionalPrice?: string
  takeProfitNotionalPrice?: string
  triggerNotionalPrice?: string
  twapBucketCount?: string
}

export interface TradeQuoteRequest extends TradeOrderFields {
  accountAddress: string
  chainId: number
  contraAsset: FlashAsset
  contraChain: number
  inputAmount: string
  orderType: FlashOrderType
  qty: string
  quickTrade?: true
  side: FlashTradeSide
  slippage?: string
  targetAsset: FlashAsset
  targetChain: number
}

export type MarketTradeQuoteRequest = TradeQuoteRequest

export interface ProviderSendPayload {
  _origin: string
  chainId: string
  id: number
  jsonrpc: '2.0'
  method: 'eth_sendTransaction' | 'eth_signTypedData_v4'
  params: unknown[]
}

export function isSameFlashAsset(a?: FlashAsset | null, b?: FlashAsset | null) {
  if (!a || !b) return false
  if (a.id === b.id) return true
  if (a.chainId !== b.chainId) return false

  const aAddress = toFlashApiAssetAddress(a).toLowerCase()
  const bAddress = toFlashApiAssetAddress(b).toLowerCase()

  return aAddress === bAddress || a.symbol.toUpperCase() === b.symbol.toUpperCase()
}

export function cleanTradeAmount(amount = '') {
  return amount.trim().replace(/,/g, '')
}

export function tradeAmountNumber(amount = '') {
  const parsed = Number(cleanTradeAmount(amount))

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

export function tradeIntegerNumber(amount = '') {
  const parsed = Number(cleanTradeAmount(amount))

  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0
}

export function formatTradeAmount(amount: number, asset: FlashAsset) {
  if (!Number.isFinite(amount) || amount <= 0) return ''

  const decimals = asset.symbol.toUpperCase() === 'USDC' ? 2 : 6

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

export function getNextTradeAction({ quote }: { orderType?: FlashOrderType; quote: FlashQuote | null }) {
  if (!quote) return ''
  if (quote.actions?.wrap && getTradeStepStatus(quote, 'wrap') !== 'complete') return 'wrap'
  if (quote.actions?.approval && getTradeStepStatus(quote, 'approve') !== 'complete') return 'approve'
  if (getTradeStepStatus(quote, 'sign') !== 'complete') return 'sign'

  return ''
}

export function getTradePrimaryLabel({
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
  if (submitting || pendingAction === 'submit') return 'Submitting'
  if (quoteLoading || pendingAction === 'quote') return 'Getting quote'

  const action = pendingAction || getNextTradeAction({ quote })

  if (action === 'wrap') return quote?.actions?.wrap?.label || 'Wrap'
  if (action === 'approve') return quote?.actions?.approval?.label || 'Approve'
  if (action === 'sign') return 'Review/sign'

  return quote ? 'Review/sign' : 'Enter details'
}

export function canReviewTrade({
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
  return !!quote && !!getNextTradeAction({ quote }) && !pendingAction && !quoteLoading && !submitting
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
  const optionalFields: Pick<TradeQuoteRequest, 'quickTrade' | 'slippage'> = {}
  const cleanSlippage = String(slippage || '').trim()

  if (quickTrade) optionalFields.quickTrade = true
  if (cleanSlippage && cleanSlippage !== TRADE_DEFAULT_SLIPPAGE) optionalFields.slippage = cleanSlippage

  return optionalFields
}

function cleanOptionalAmount(value?: string) {
  const clean = cleanTradeAmount(value || '')

  return tradeAmountNumber(clean) ? clean : ''
}

function cleanDurationSeconds(value?: string) {
  const clean = cleanTradeAmount(value || '')
  const parsed = tradeIntegerNumber(clean)

  return parsed >= TRADE_MIN_DURATION_SECONDS && parsed <= TRADE_MAX_DURATION_SECONDS ? String(parsed) : ''
}

function cleanTwapBucketCount(value?: string) {
  const clean = cleanTradeAmount(value || '')
  const parsed = tradeIntegerNumber(clean)

  return parsed >= TRADE_MIN_TWAP_BUCKETS && parsed <= TRADE_MAX_TWAP_BUCKETS ? String(parsed) : ''
}

export function getTradeValidationError({
  durationSeconds,
  inputAmount,
  limitNotionalPrice,
  orderType,
  stopLossNotionalPrice,
  takeProfitNotionalPrice,
  triggerNotionalPrice,
  twapBucketCount
}: TradeOrderFields & { inputAmount: string; orderType: FlashOrderType }) {
  if (!tradeAmountNumber(inputAmount)) return 'Enter an amount to trade.'

  if (orderType === FLASH_LIMIT_ORDER_TYPE && !cleanOptionalAmount(limitNotionalPrice)) {
    return 'Enter a limit price.'
  }

  if (
    [FLASH_STOP_ORDER_TYPE, FLASH_STOP_LOSS_ORDER_TYPE, FLASH_TAKE_PROFIT_ORDER_TYPE].includes(orderType) &&
    !cleanOptionalAmount(triggerNotionalPrice)
  ) {
    return 'Enter a trigger price.'
  }

  if (orderType === FLASH_BRACKET_ORDER_TYPE) {
    if (!cleanOptionalAmount(takeProfitNotionalPrice)) return 'Enter a take-profit price.'
    if (!cleanOptionalAmount(stopLossNotionalPrice)) return 'Enter a stop-loss price.'
  }

  if (orderType === FLASH_TWAP_ORDER_TYPE) {
    if (!cleanDurationSeconds(durationSeconds)) return 'Duration must be 600 to 2592000 seconds.'
    if (!cleanTwapBucketCount(twapBucketCount)) return 'Buckets must be 2 to 2560.'
  }

  return ''
}

function getOrderFields(orderType: FlashOrderType, fields: TradeOrderFields): TradeOrderFields {
  if (orderType === FLASH_LIMIT_ORDER_TYPE) {
    return { limitNotionalPrice: cleanOptionalAmount(fields.limitNotionalPrice) }
  }

  if ([FLASH_STOP_ORDER_TYPE, FLASH_STOP_LOSS_ORDER_TYPE, FLASH_TAKE_PROFIT_ORDER_TYPE].includes(orderType)) {
    return { triggerNotionalPrice: cleanOptionalAmount(fields.triggerNotionalPrice) }
  }

  if (orderType === FLASH_BRACKET_ORDER_TYPE) {
    return {
      stopLossNotionalPrice: cleanOptionalAmount(fields.stopLossNotionalPrice),
      takeProfitNotionalPrice: cleanOptionalAmount(fields.takeProfitNotionalPrice)
    }
  }

  if (orderType === FLASH_TWAP_ORDER_TYPE) {
    return {
      durationSeconds: cleanDurationSeconds(fields.durationSeconds),
      twapBucketCount: cleanTwapBucketCount(fields.twapBucketCount)
    }
  }

  return {}
}

export function buildTradeQuoteRequest({
  accountAddress,
  contraAsset,
  durationSeconds,
  inputAmount,
  limitNotionalPrice,
  orderType,
  quickTrade,
  side,
  slippage,
  stopLossNotionalPrice,
  takeProfitNotionalPrice,
  targetAsset,
  triggerNotionalPrice,
  twapBucketCount
}: {
  accountAddress?: string
  contraAsset: FlashAsset
  inputAmount: string
  orderType: FlashOrderType
  quickTrade: boolean
  side: FlashTradeSide
  slippage: string
  targetAsset: FlashAsset
} & TradeOrderFields): TradeQuoteRequest | null {
  const qty = cleanTradeAmount(inputAmount)
  const validationError = getTradeValidationError({
    durationSeconds,
    inputAmount: qty,
    limitNotionalPrice,
    orderType,
    stopLossNotionalPrice,
    takeProfitNotionalPrice,
    triggerNotionalPrice,
    twapBucketCount
  })

  if (validationError) return null
  if (!accountAddress) throw new Error('Select an account to trade.')

  const chainId = targetAsset.chainId || contraAsset.chainId

  return {
    accountAddress,
    chainId,
    contraAsset,
    contraChain: chainId,
    inputAmount: qty,
    orderType,
    qty,
    side,
    targetAsset,
    targetChain: chainId,
    ...getMarketTradeOptionalFields({ quickTrade, slippage }),
    ...getOrderFields(orderType, {
      durationSeconds,
      limitNotionalPrice,
      stopLossNotionalPrice,
      takeProfitNotionalPrice,
      triggerNotionalPrice,
      twapBucketCount
    })
  }
}

export function buildMarketTradeQuoteRequest(request: any) {
  return buildTradeQuoteRequest({ ...request, orderType: FLASH_MARKET_ORDER_TYPE })
}

export function marketTradeQuoteRequestKey(request: TradeQuoteRequest) {
  return JSON.stringify([
    request.accountAddress,
    request.chainId,
    request.side,
    request.orderType,
    request.targetAsset?.id,
    request.contraAsset?.id,
    request.qty,
    request.slippage,
    request.quickTrade,
    request.limitNotionalPrice,
    request.triggerNotionalPrice,
    request.takeProfitNotionalPrice,
    request.stopLossNotionalPrice,
    request.durationSeconds,
    request.twapBucketCount
  ])
}

export function findTradeBalance(asset: FlashAsset, balances: BalanceSummary[]) {
  return balances.find((balance) => {
    const chainMatches = Number(balance.chainId) === asset.chainId
    const balanceAddress = (balance.address || '').toLowerCase()
    const assetAddress = toFlashApiAssetAddress(asset).toLowerCase()
    const nativeMatches = asset.isNative
      ? balanceAddress === NATIVE_CURRENCY
      : balanceAddress === assetAddress

    return chainMatches && nativeMatches
  })
}

function tradeAssetMapKey(asset: FlashAsset) {
  return `${asset.chainId}:${toFlashApiAssetAddress(asset).toLowerCase()}`
}

function networkEnabled(networks: Record<string | number, { on?: boolean }>, chainId: number) {
  const network = networks[chainId] || networks[String(chainId)]

  return !network || network.on !== false
}

export function buildTradeAssetOptions({
  balances,
  networks = {},
  runtime = {}
}: {
  balances: BalanceSummary[]
  networks?: Record<string | number, { on?: boolean }>
  runtime?: FlashRuntime
}) {
  const assets = new Map<string, FlashAsset>()
  const addAsset = (asset: FlashAsset) => {
    if (!isFlashChainSupported(asset.chainId, runtime)) return
    if (!networkEnabled(networks, asset.chainId)) return
    assets.set(tradeAssetMapKey(asset), asset)
  }

  balances.forEach((balance) => {
    try {
      addAsset(balanceSummaryToFlashAsset(balance))
    } catch {
      // Ignore malformed portfolio rows; they are not valid Flash selector options.
    }
  })

  if (isFlashChainSupported(31337, runtime) && networkEnabled(networks, 31337)) {
    getFlashAssetsForChain(31337).forEach(addAsset)
  }

  return Array.from(assets.values())
}

export function getFlashBalanceEntries(balances: BalanceSummary[], assets: readonly FlashAsset[]) {
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
  durationSeconds,
  flashPayload,
  quickTrade,
  quote,
  signature,
  slippage,
  stopLossNotionalPrice,
  takeProfitNotionalPrice,
  triggerNotionalPrice,
  twapBucketCount,
  limitNotionalPrice
}: {
  accountAddress: string
  flashPayload: unknown
  quickTrade: boolean
  quote: FlashQuote
  signature: string
  slippage: string
} & TradeOrderFields) {
  const chainId = quote.targetAsset.chainId || quote.contraAsset.chainId
  const rawPayload = flashPayload || quote.raw || null

  return {
    accountAddress,
    chainId,
    contraAsset: quote.contraAsset,
    contraChain: chainId,
    durationSeconds,
    evmOrderTypedData: getFlashOrderTypedData(quote, flashPayload),
    inputAmount: quote.inputAmount,
    limitNotionalPrice,
    orderSignature: signature,
    orderType: quote.orderType,
    qty: quote.inputAmount,
    quote,
    quoteId: quote.id || objectRecord(rawPayload).quoteId,
    rawPayload,
    side: quote.side,
    signature,
    stopLossNotionalPrice,
    takeProfitNotionalPrice,
    targetAsset: quote.targetAsset,
    targetChain: chainId,
    triggerNotionalPrice,
    twapBucketCount,
    ...getMarketTradeOptionalFields({ quickTrade, slippage })
  }
}
