import { type BalanceSummary } from '../../../domain/balance'
import {
  FLASH_LIMIT_ORDER_TYPE,
  FLASH_MARKET_ORDER_TYPE,
  FLASH_STOP_LOSS_ORDER_TYPE,
  FLASH_STOP_ORDER_TYPE,
  FLASH_TAKE_PROFIT_ORDER_TYPE,
  FLASH_TWAP_ORDER_TYPE
} from '../../../domain/flash/constants'
import {
  balanceSummaryToFlashAsset,
  getFlashAssetsForChain,
  toFlashApiAssetAddress
} from '../../../domain/flash/assets'
import { isFlashChainSupported } from '../../../domain/flash/chains'
import {
  type FlashAsset,
  type FlashOrderType,
  type FlashPriceTrigger,
  type FlashQuote,
  type FlashRuntime,
  type FlashStep,
  type FlashTradeSide
} from '../../../domain/flash/schemas'

export const TRADE_DEFAULT_SLIPPAGE = ''
export const TRADE_DEFAULT_MAX_PRICE_IMPACT = ''
export const TRADE_DEFAULT_DURATION_DAYS = '0'
export const TRADE_DEFAULT_DURATION_HOURS = '1'
export const TRADE_DEFAULT_DURATION_MINUTES = '0'
export const TRADE_MIN_DURATION_SECONDS = 300
export const TRADE_MAX_DURATION_SECONDS = 2_592_000
export const TRADE_MIN_TWAP_BUCKETS = 2
export const TRADE_MAX_TWAP_BUCKETS = 2_560

export type TradeTimeInForce = 'gtc' | 'gtt'

export interface TradeOrderFields {
  durationDays?: string
  durationHours?: string
  durationMinutes?: string
  expireTime?: string
  limitNotionalPrice?: string
  maxPriceImpact?: string
  startTime?: string
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
  startTime?: string
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

export function getEstimatedTradePriceImpact(
  quote?: Pick<FlashQuote, 'inputNotional' | 'outputNotional' | 'from' | 'to'> | null
) {
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

export function tradeErrorMessage(error: unknown, fallback: string) {
  const record = objectRecord(error)

  if (!error) return fallback
  if (typeof error === 'string') return error
  if (typeof record.message === 'string') return record.message
  if (typeof objectRecord(record.error).message === 'string') return objectRecord(record.error).message

  return fallback
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

function cleanStartTime(value?: string) {
  if (!String(value || '').trim()) return ''

  return cleanExpireTime(value)
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
  startTime,
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

    if (cleanTradeAmount(limitNotionalPrice || '') && !cleanOptionalAmount(limitNotionalPrice)) {
      return 'Enter a valid TWAP limit price or leave it blank for market execution.'
    }

    if (String(startTime || '').trim()) {
      const timestamp = Date.parse(String(startTime))
      if (!Number.isFinite(timestamp) || timestamp <= Date.now()) {
        return 'Choose a future TWAP start time or leave it blank to start immediately.'
      }
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
  quote: Pick<FlashQuote, 'targetAsset' | 'targetNotionalPrice'> | null
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
  | 'durationSeconds'
  | 'expireTime'
  | 'limitNotionalPrice'
  | 'maxPriceImpact'
  | 'startTime'
  | 'triggers'
  | 'twapBucketCount'
> {
  const result: Pick<
    TradeQuoteRequest,
    | 'durationSeconds'
    | 'expireTime'
    | 'limitNotionalPrice'
    | 'maxPriceImpact'
    | 'startTime'
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
    const limitPrice = cleanOptionalAmount(fields.limitNotionalPrice)
    if (limitPrice) result.limitNotionalPrice = limitPrice
    const startTime = cleanStartTime(fields.startTime)
    if (startTime) result.startTime = startTime
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
    request.startTime,
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
