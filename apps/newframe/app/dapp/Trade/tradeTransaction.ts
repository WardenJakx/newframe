import { type BalanceSummary } from '../../../resources/domain/balance'
import {
  FLASH_LIMIT_ORDER_TYPE,
  FLASH_MARKET_ORDER_TYPE,
  FLASH_STOP_LOSS_ORDER_TYPE,
  FLASH_STOP_ORDER_TYPE,
  FLASH_TAKE_PROFIT_ORDER_TYPE,
  FLASH_TWAP_ORDER_TYPE
} from '../../../resources/domain/flash/constants'
import {
  balanceSummaryToFlashAsset,
  getFlashAssetsForChain,
  toFlashApiAssetAddress
} from '../../../resources/domain/flash/assets'
import { isFlashChainSupported } from '../../../resources/domain/flash/chains'
import {
  type FlashAsset,
  type FlashOrderType,
  type FlashPriceTrigger,
  type FlashQuote,
  type FlashQuoteAction,
  type FlashQuoteTransactionRequest,
  type FlashRuntime,
  type FlashStep,
  type FlashTradeSide
} from '../../../resources/domain/flash/schemas'

export const TRADE_DEFAULT_SLIPPAGE = ''
export const TRADE_DEFAULT_MAX_PRICE_IMPACT = ''
export const TRADE_DEFAULT_DURATION_DAYS = '0'
export const TRADE_DEFAULT_DURATION_HOURS = '1'
export const TRADE_DEFAULT_DURATION_MINUTES = '0'
export const TRADE_MIN_DURATION_SECONDS = 300
export const TRADE_MAX_DURATION_SECONDS = 2_592_000
export const TRADE_MIN_TWAP_BUCKETS = 2
export const TRADE_MAX_TWAP_BUCKETS = 2_560

export type TradePendingAction = '' | 'quote' | FlashStep['kind']
export type TradeReviewAction = '' | 'wrap' | 'approve' | 'sign'
export type TradeTimeInForce = 'gtc' | 'gtt'

export interface TradeOrderFields {
  durationDays?: string
  durationHours?: string
  durationMinutes?: string
  expireTime?: string
  limitNotionalPrice?: string
  maxPriceImpact?: string
  timeInForce?: TradeTimeInForce
  triggerNotionalPrice?: string
  twapBucketCount?: string
}

export interface TradeQuoteRequest {
  accountAddress: string
  chainId: number
  contraAsset: FlashAsset
  contraChain: number
  durationSeconds?: number
  expireTime?: string
  inputAmount: string
  limitNotionalPrice?: string
  maxPriceImpact?: string
  orderType: FlashOrderType
  qty: string
  quickTrade?: true
  side: FlashTradeSide
  slippage?: string
  targetAsset: FlashAsset
  targetChain: number
  triggers?: FlashPriceTrigger[]
  twapBucketCount?: number
}

export type MarketTradeQuoteRequest = TradeQuoteRequest

export function cleanTradeAmount(amount = '') {
  return amount.trim().replace(/,/g, '')
}

export function tradeAmountNumber(amount = '') {
  const parsed = Number(cleanTradeAmount(amount))

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

export function tradeIntegerNumber(amount = '') {
  const parsed = Number(cleanTradeAmount(amount))

  return Number.isInteger(parsed) && parsed >= 0 ? parsed : -1
}

export function formatTradeAmount(amount: number, asset: FlashAsset) {
  if (!Number.isFinite(amount) || amount <= 0) return ''

  const decimals = asset.symbol.toUpperCase() === 'USDC' ? 2 : 6

  return amount
    .toFixed(decimals)
    .replace(/\.?0+$/, '')
    .replace(/^\./, '0.')
}

export function formatTradeNotional(value?: string | number | null) {
  const amount = Number(value)
  if (!Number.isFinite(amount)) return '$0.00'

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: Math.abs(amount) < 1 ? 4 : 2
  }).format(amount)
}

export function getEstimatedTradePriceImpact(quote?: FlashQuote | null) {
  const inputNotional = Number(quote?.inputNotional || quote?.from?.notional)
  const outputNotional = Number(quote?.outputNotional || quote?.to?.notional)
  if (!Number.isFinite(inputNotional) || inputNotional <= 0 || !Number.isFinite(outputNotional)) return null

  return ((inputNotional - outputNotional) / inputNotional) * 100
}

export function getTradeTriggerDeltaPercent(triggerPrice?: string, currentPrice?: string) {
  const trigger = Number(triggerPrice)
  const current = Number(currentPrice)
  if (!Number.isFinite(trigger) || !Number.isFinite(current) || current <= 0) return null

  return ((trigger - current) / current) * 100
}

export function buildVisualTradeSteps(spentAsset: FlashAsset, _orderType: FlashOrderType, hasQuote: boolean) {
  const status = hasQuote ? 'required' : 'idle'
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
    { id: 'sign', kind: 'sign', label: 'Sign order', status },
    { id: 'submit', kind: 'submit', label: 'Submit order', status }
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

function normalizeTradeChainId(chainId: unknown) {
  const value =
    typeof chainId === 'string'
      ? Number.parseInt(chainId, chainId.toLowerCase().startsWith('0x') ? 16 : 10)
      : Number(chainId)

  if (!Number.isInteger(value) || value <= 0) throw new Error('Invalid Flash chain id')

  return value
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
  submitting,
  validationError = ''
}: {
  orderType: FlashOrderType
  pendingAction: TradePendingAction
  quote: FlashQuote | null
  quoteLoading: boolean
  submitting: boolean
  validationError?: string
}) {
  return (
    !!quote &&
    !!getNextTradeAction({ quote }) &&
    !pendingAction &&
    !quoteLoading &&
    !submitting &&
    !validationError
  )
}

type FlashTypedDataField = 'orderTypedData' | 'orderTypedDataRaw' | 'permitTypedData' | 'permitTypedDataRaw'

function findFlashTypedData(quote: FlashQuote | null, flashPayload: unknown, field: FlashTypedDataField) {
  const quoteRaw = objectRecord(quote?.raw)

  return (
    nestedRecord(flashPayload, ['actions', 'evm', field]) ||
    nestedRecord(flashPayload, ['evm', field]) ||
    nestedRecord(flashPayload, [field]) ||
    nestedRecord(quoteRaw, ['actions', 'evm', field]) ||
    nestedRecord(quoteRaw, ['evm', field]) ||
    nestedRecord(quoteRaw, [field])
  )
}

function parseFlashTypedData(typedData: unknown) {
  if (typeof typedData !== 'string') return typedData

  try {
    return JSON.parse(typedData)
  } catch {
    return null
  }
}

export function getFlashOrderTypedData(quote: FlashQuote | null, flashPayload: unknown) {
  return parseFlashTypedData(findFlashTypedData(quote, flashPayload, 'orderTypedData'))
}

export function getFlashPermitTypedData(quote: FlashQuote | null, flashPayload: unknown) {
  return parseFlashTypedData(findFlashTypedData(quote, flashPayload, 'permitTypedData'))
}

export function getFlashOrderTypedDataForSubmit(quote: FlashQuote | null, flashPayload: unknown) {
  const typedData =
    findFlashTypedData(quote, flashPayload, 'orderTypedDataRaw') ||
    findFlashTypedData(quote, flashPayload, 'orderTypedData')

  return typeof typedData === 'string' ? typedData : typedData ? JSON.stringify(typedData) : ''
}

export function getFlashPermitTypedDataForSubmit(quote: FlashQuote | null, flashPayload: unknown) {
  const typedData =
    findFlashTypedData(quote, flashPayload, 'permitTypedDataRaw') ||
    findFlashTypedData(quote, flashPayload, 'permitTypedData')

  return typeof typedData === 'string' ? typedData : typedData ? JSON.stringify(typedData) : ''
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
  if (cleanSlippage) optionalFields.slippage = cleanSlippage

  return optionalFields
}

function cleanOptionalAmount(value?: string) {
  const clean = cleanTradeAmount(value || '')

  return tradeAmountNumber(clean) ? clean : ''
}

export function getTradeDurationSeconds(fields: TradeOrderFields) {
  const days = tradeIntegerNumber(fields.durationDays || '')
  const hours = tradeIntegerNumber(fields.durationHours || '')
  const minutes = tradeIntegerNumber(fields.durationMinutes || '')

  if (days < 0 || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return 0

  return days * 86_400 + hours * 3_600 + minutes * 60
}

function cleanTwapBucketCount(value?: string) {
  const clean = cleanTradeAmount(value || '')
  if (!clean) return undefined

  const parsed = tradeIntegerNumber(clean)
  return parsed >= TRADE_MIN_TWAP_BUCKETS && parsed <= TRADE_MAX_TWAP_BUCKETS ? parsed : undefined
}

function cleanExpireTime(value?: string) {
  const timestamp = Date.parse(String(value || ''))

  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : ''
}

function triggerTypeForOrder(orderType: FlashOrderType): FlashPriceTrigger['triggerType'] | '' {
  if (orderType === FLASH_STOP_LOSS_ORDER_TYPE) return 'lower'
  if (orderType === FLASH_STOP_ORDER_TYPE || orderType === FLASH_TAKE_PROFIT_ORDER_TYPE) return 'upper'
  return ''
}

function orderSupportsTimeInForce(orderType: FlashOrderType) {
  return [
    FLASH_LIMIT_ORDER_TYPE,
    FLASH_STOP_ORDER_TYPE,
    FLASH_STOP_LOSS_ORDER_TYPE,
    FLASH_TAKE_PROFIT_ORDER_TYPE
  ].includes(orderType)
}

export function getTradeValidationError({
  durationDays,
  durationHours,
  durationMinutes,
  expireTime,
  inputAmount,
  limitNotionalPrice,
  maxPriceImpact,
  orderType,
  side,
  slippage,
  timeInForce,
  triggerNotionalPrice,
  twapBucketCount
}: TradeOrderFields & {
  inputAmount: string
  orderType: FlashOrderType
  side?: FlashTradeSide
  slippage?: string
}) {
  if (!tradeAmountNumber(inputAmount)) return 'Enter an amount to trade.'

  if (orderType === FLASH_MARKET_ORDER_TYPE) {
    const cleanSlippage = cleanTradeAmount(slippage || '')
    const maxSlippage = Number(cleanSlippage)
    if (cleanSlippage && (!Number.isFinite(maxSlippage) || maxSlippage < 0 || maxSlippage > 100)) {
      return 'Max slippage must be between 0% and 100%.'
    }
  }

  if (orderType === FLASH_LIMIT_ORDER_TYPE && !cleanOptionalAmount(limitNotionalPrice)) {
    return 'Enter a limit price.'
  }

  if ([FLASH_STOP_ORDER_TYPE, FLASH_STOP_LOSS_ORDER_TYPE, FLASH_TAKE_PROFIT_ORDER_TYPE].includes(orderType)) {
    if (!cleanOptionalAmount(triggerNotionalPrice)) return 'Enter a trigger price.'
    if (cleanTradeAmount(limitNotionalPrice || '') && !cleanOptionalAmount(limitNotionalPrice)) {
      return 'Enter a valid limit price or leave it blank for a market order.'
    }
    if (orderType === FLASH_STOP_ORDER_TYPE && side !== 'buy') return 'Stop orders must buy the target asset.'
    if ([FLASH_STOP_LOSS_ORDER_TYPE, FLASH_TAKE_PROFIT_ORDER_TYPE].includes(orderType) && side !== 'sell') {
      return 'TP/SL orders must sell the target asset.'
    }
  }

  if (orderType === FLASH_TWAP_ORDER_TYPE) {
    const durationSeconds = getTradeDurationSeconds({ durationDays, durationHours, durationMinutes })
    if (durationSeconds < TRADE_MIN_DURATION_SECONDS || durationSeconds > TRADE_MAX_DURATION_SECONDS) {
      return 'TWAP duration must be between 5 minutes and 30 days.'
    }

    const cleanBuckets = cleanTradeAmount(twapBucketCount || '')
    if (cleanBuckets && cleanTwapBucketCount(cleanBuckets) === undefined) {
      return 'Segments must be 2 to 2560, or left automatic.'
    }

    const cleanMaxImpact = cleanTradeAmount(maxPriceImpact || '')
    const maxImpact = Number(cleanMaxImpact)
    if (cleanMaxImpact && (!Number.isFinite(maxImpact) || maxImpact < 0 || maxImpact > 100)) {
      return 'Max price impact must be between 0% and 100%.'
    }
  }

  if (orderSupportsTimeInForce(orderType) && timeInForce === 'gtt') {
    const timestamp = Date.parse(String(expireTime || ''))
    if (!Number.isFinite(timestamp) || timestamp <= Date.now()) return 'Choose a future expiry time.'
  }

  return ''
}

export function getTradeQuoteValidationError({
  orderType,
  quote,
  triggerNotionalPrice
}: {
  orderType: FlashOrderType
  quote: FlashQuote | null
  triggerNotionalPrice?: string
}) {
  if (!quote || !triggerTypeForOrder(orderType)) return ''

  const triggerPrice = Number(triggerNotionalPrice)
  const currentPrice = Number(quote.targetNotionalPrice)
  if (!Number.isFinite(triggerPrice) || !Number.isFinite(currentPrice) || currentPrice <= 0) return ''

  if (orderType === FLASH_STOP_LOSS_ORDER_TYPE && triggerPrice >= currentPrice) {
    return `Stop loss must be below the current ${quote.targetAsset.symbol}/USD price.`
  }
  if (orderType === FLASH_TAKE_PROFIT_ORDER_TYPE && triggerPrice <= currentPrice) {
    return `Take profit must be above the current ${quote.targetAsset.symbol}/USD price.`
  }
  if (orderType === FLASH_STOP_ORDER_TYPE && triggerPrice <= currentPrice) {
    return `Stop trigger must be above the current ${quote.targetAsset.symbol}/USD price.`
  }

  return ''
}

function getOrderFields(
  orderType: FlashOrderType,
  fields: TradeOrderFields
): Pick<
  TradeQuoteRequest,
  'durationSeconds' | 'expireTime' | 'limitNotionalPrice' | 'maxPriceImpact' | 'triggers' | 'twapBucketCount'
> {
  const result: Pick<
    TradeQuoteRequest,
    | 'durationSeconds'
    | 'expireTime'
    | 'limitNotionalPrice'
    | 'maxPriceImpact'
    | 'triggers'
    | 'twapBucketCount'
  > = {}

  if (orderType === FLASH_LIMIT_ORDER_TYPE) {
    result.limitNotionalPrice = cleanOptionalAmount(fields.limitNotionalPrice)
  }

  const triggerType = triggerTypeForOrder(orderType)
  if (triggerType) {
    result.triggers = [
      {
        notionalPrice: cleanOptionalAmount(fields.triggerNotionalPrice),
        triggerType
      }
    ]
    const limitPrice = cleanOptionalAmount(fields.limitNotionalPrice)
    if (limitPrice) result.limitNotionalPrice = limitPrice
  }

  if (orderType === FLASH_TWAP_ORDER_TYPE) {
    result.durationSeconds = getTradeDurationSeconds(fields)
    const buckets = cleanTwapBucketCount(fields.twapBucketCount)
    if (buckets !== undefined) result.twapBucketCount = buckets
    const maxPriceImpact = cleanTradeAmount(fields.maxPriceImpact || '')
    if (maxPriceImpact) result.maxPriceImpact = maxPriceImpact
  }

  if (orderSupportsTimeInForce(orderType) && fields.timeInForce === 'gtt') {
    result.expireTime = cleanExpireTime(fields.expireTime)
  }

  return result
}

export function buildTradeQuoteRequest({
  accountAddress,
  contraAsset,
  inputAmount,
  orderType,
  quickTrade,
  side,
  slippage,
  targetAsset,
  ...orderFields
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
    ...orderFields,
    inputAmount: qty,
    orderType,
    side,
    slippage
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
    ...(orderType === FLASH_MARKET_ORDER_TYPE ? getMarketTradeOptionalFields({ quickTrade, slippage }) : {}),
    ...getOrderFields(orderType, orderFields)
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
    request.triggers,
    request.durationSeconds,
    request.twapBucketCount,
    request.maxPriceImpact,
    request.expireTime
  ])
}

function tradeAssetMapKey(asset: FlashAsset) {
  return `${asset.chainId}:${toFlashApiAssetAddress(asset).toLowerCase()}`
}

export function createTradeBalanceIndex(balances: BalanceSummary[]) {
  const balanceIndex = new Map<string, BalanceSummary>()

  balances.forEach((balance) => {
    try {
      const asset = balanceSummaryToFlashAsset(balance)
      balanceIndex.set(tradeAssetMapKey(asset), balance)
    } catch {
      // Ignore malformed portfolio rows; they cannot be indexed as Flash assets.
    }
  })

  return balanceIndex
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

export function getFlashBalanceEntries(
  balances: BalanceSummary[],
  assets: readonly FlashAsset[],
  balanceIndex = createTradeBalanceIndex(balances)
) {
  return assets.map((asset) => {
    const balance = balanceIndex.get(tradeAssetMapKey(asset))

    return {
      id: asset.id,
      assetId: asset.id,
      symbol: asset.symbol,
      balance: balance?.balance || '0'
    }
  })
}

export function buildTradeTransactionRequest({
  accountAddress,
  tx
}: {
  accountAddress: string
  tx?: FlashQuoteTransactionRequest | null
}) {
  if (!accountAddress || !tx?.to) {
    throw new Error('Flash action is missing a transaction request.')
  }

  const chainIdNumber = normalizeTradeChainId(tx.chainId)
  const transaction = {
    to: tx.to,
    data: tx.data,
    value: tx.value || '0x0'
  }

  return { chainId: chainIdNumber, transaction }
}

export function buildTradeActionRequest({
  accountAddress,
  action
}: {
  accountAddress: string
  action?: FlashQuoteAction | null
}) {
  return buildTradeTransactionRequest({
    accountAddress,
    tx: action?.tx
  })
}

export function buildTradeSignatureRequest({
  accountAddress,
  flashPayload,
  quote
}: {
  accountAddress: string
  flashPayload: unknown
  quote: FlashQuote | null
}) {
  const typedData = getFlashOrderTypedData(quote, flashPayload)

  if (!accountAddress || !quote || !typedData) {
    throw new Error('Flash quote is missing order typed data.')
  }

  const typedDataDomain = objectRecord(objectRecord(typedData).domain)
  const chainIdNumber = normalizeTradeChainId(typedDataDomain.chainId || quote.targetAsset.chainId)

  return { chainId: chainIdNumber, typedData }
}

export function buildTradePermitSignatureRequest({
  accountAddress,
  flashPayload,
  quote
}: {
  accountAddress: string
  flashPayload: unknown
  quote: FlashQuote | null
}) {
  const typedData = getFlashPermitTypedData(quote, flashPayload)
  if (!typedData) return null
  if (!accountAddress || !quote) throw new Error('Flash quote is missing permit typed data.')

  const typedDataDomain = objectRecord(objectRecord(typedData).domain)
  const chainIdNumber = normalizeTradeChainId(typedDataDomain.chainId || quote.targetAsset.chainId)

  return { chainId: chainIdNumber, typedData }
}

export function buildTradeSubmitRequest({
  accountAddress,
  flashPayload,
  permitSignature,
  quickTrade,
  quote,
  signature,
  slippage,
  ...orderFields
}: {
  accountAddress: string
  flashPayload: unknown
  permitSignature?: string
  quickTrade: boolean
  quote: FlashQuote
  signature: string
  slippage: string
} & TradeOrderFields) {
  const chainId = quote.targetAsset.chainId || quote.contraAsset.chainId
  const rawPayload = flashPayload || quote.raw || null
  const evmPermitTypedData = getFlashPermitTypedDataForSubmit(quote, flashPayload)

  if (evmPermitTypedData && !permitSignature) {
    throw new Error('Flash quote requires a permit signature.')
  }

  return {
    accountAddress,
    chainId,
    contraAsset: quote.contraAsset,
    contraChain: chainId,
    evmOrderTypedData: getFlashOrderTypedDataForSubmit(quote, flashPayload),
    ...(evmPermitTypedData ? { evmPermitSignature: permitSignature, evmPermitTypedData } : {}),
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
    ...(quote.orderType === FLASH_MARKET_ORDER_TYPE
      ? getMarketTradeOptionalFields({ quickTrade, slippage })
      : {}),
    ...getOrderFields(quote.orderType, orderFields)
  }
}

export type TradeSubmitRequest = ReturnType<typeof buildTradeSubmitRequest>
