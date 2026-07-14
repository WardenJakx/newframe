import store from '../store'
import { getMainRuntime } from '../runtime'
import {
  FLASH_NATIVE_ETH_TOKEN_ADDRESS,
  FLASH_MARKET_ORDER_TYPE,
  flashAssetId,
  getFlashChainSlug,
  getFlashAssetsForChain,
  getReceiveAsset,
  getSpentAsset,
  isFlashChainSupported,
  toFlashApiAssetAddress,
  type FlashAsset,
  type FlashOrderType,
  type FlashQuote,
  type FlashQuoteAction,
  type FlashQuoteFee,
  type FlashQuoteTransactionRequest,
  type FlashRuntime,
  type FlashStep,
  type FlashTradeSide
} from '../../resources/domain/flash'

import type { Token } from '../store/state'

type FlashOrderStatus =
  | 'pending'
  | 'accepted'
  | 'partially-filled'
  | 'filled'
  | 'cancelled'
  | 'rejected'
  | 'terminated'
  | 'expired'

type FlashChainInput =
  | number
  | string
  | {
      id?: number | string
      chainId?: number | string
    }
  | null
  | undefined

type FlashAssetInput = FlashAsset | string | null | undefined

interface FlashPriceTriggerInput {
  notionalPrice?: string | number
  triggerType?: 'lower' | 'upper'
}

export interface FlashQuoteRequest {
  accountAddress?: string
  targetChain?: FlashChainInput
  contraChain?: FlashChainInput
  chainId?: number | string
  targetAsset?: FlashAssetInput
  contraAsset?: FlashAssetInput
  side?: FlashTradeSide
  qty?: string
  inputAmount?: string
  orderType?: FlashOrderType
  slippage?: string | number
  maxPriceImpact?: string | number
  quickTrade?: boolean
  durationSeconds?: string | number
  expireTime?: string
  limitNotionalPrice?: string | number
  stopLossNotionalPrice?: string | number
  takeProfitNotionalPrice?: string | number
  triggerNotionalPrice?: string | number
  triggers?: FlashPriceTriggerInput[]
  twapBucketCount?: string | number
}

export interface FlashSubmitOrderRequest extends FlashQuoteRequest {
  evmOrderTypedData?: unknown
  evmPermitSignature?: string
  evmPermitTypedData?: unknown
  quote?: FlashQuote
  quoteId?: string
  signature?: string
  orderSignature?: string
  rawPayload?: unknown
}

export interface FlashListOrdersRequest {
  accountAddress?: string
  chainId?: number | string
  pageSize?: number
  status?: FlashOrderStatus | FlashOrderStatus[] | string | string[]
}

export interface FlashGetOrderRequest {
  accountAddress?: string
  orderId: string
}

export interface FlashCancelOrderRequest {
  cancelMessage?: unknown
  orderId: string
  signature?: string
  userSignature?: string
}

interface FlashOrderRecord {
  orderId: string
  accountAddress: string
  chainId: number
  provider: 'flash'
  source: 'flash'
  environment: string
  profile: string | null
  status: FlashOrderStatus
  rawStatus: string
  orderType: string
  side: string
  targetAsset: FlashAsset
  contraAsset: FlashAsset
  qty: string
  spentAsset: FlashAsset
  spentAmount: string
  outputAmount: string
  estimatedOutputAmount: string
  filledOutputAmount?: string | null
  averageFillPrice?: string | null
  createdAt: number
  updatedAt: number
  terminalAt?: number | null
  open: boolean
  cancellable: boolean
  quoteId?: string
  receiveAsset: FlashAsset
  rate?: string
  rawPayload?: unknown
  rawStatusPayload?: unknown
  fillHash?: string | null
  fillTransactionHash?: string | null
}

export interface FlashOrderPositionUpdate {
  address: string
  chainId: number
  tokens: Token[]
}

export interface FlashPositionSync {
  refresh: (update: FlashOrderPositionUpdate) => void
  track: (update: FlashOrderPositionUpdate) => void
}

const FLASH_DEV_BASE_URL = 'http://127.0.0.1:8422/v1'
const FLASH_PROD_BASE_URL = 'https://flash.definitive.fi/v1'
const FLASH_API_KEY = 'dpka_513a2bd7_57a2_46d2_927b_2a3857fe271b'
const FLASH_MARKET_ORDER_NOTIFICATION_MS = 60 * 1000
const FLASH_RESOLVED_ORDER_NOTIFICATION_MS = 3 * 1000
const FLASH_MARKET_ORDER_POLL_MS = 3 * 1000
const FLASH_OPEN_ORDER_POLL_MS = 5 * 60 * 1000

const terminalStatuses = new Set<FlashOrderStatus>([
  'filled',
  'cancelled',
  'rejected',
  'terminated',
  'expired'
])
const openStatuses = new Set<FlashOrderStatus>(['pending', 'accepted', 'partially-filled'])

interface FlashMarketOrderPoller {
  deadline: number
  timer?: ReturnType<typeof setTimeout>
}

const marketOrderPollers = new Map<string, FlashMarketOrderPoller>()
let openOrderPoller: ReturnType<typeof setInterval> | null = null
let openOrderRefresh: Promise<FlashOrderRecord[]> | null = null
let positionSync: FlashPositionSync | null = null

const FLASH_CHAIN_IDS_BY_SLUG: Record<string, number> = {
  ethereum: 1,
  optimism: 10,
  bsc: 56,
  polygon: 137,
  hyperevm: 999,
  base: 8453,
  plasma: 9745,
  blast: 81457,
  arbitrum: 42161,
  avalanche: 43114,
  monad: 143,
  anvil: 31337
}

function runtime(): FlashRuntime & { environment: string; profile: string | null } {
  return getMainRuntime()
}

function isDevRuntime() {
  return runtime().isDev === true
}

export function flashBaseUrl() {
  return isDevRuntime() ? FLASH_DEV_BASE_URL : FLASH_PROD_BASE_URL
}

export function flashHeaders() {
  const headers: Record<string, string> = {
    accept: 'application/json',
    'content-type': 'application/json'
  }

  if (!isDevRuntime()) {
    headers['x-definitive-api-key'] = FLASH_API_KEY
  }

  return headers
}

function normalizeAddress(address?: string) {
  return (address || '').trim().toLowerCase()
}

function normalizeAmount(amount?: string | number) {
  return String(amount || '')
    .trim()
    .replace(/,/g, '')
}

function objectPayload(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, any>) : {}
}

function stringValue(value: unknown, fallback = '') {
  if (value === undefined || value === null) return fallback

  return String(value)
}

function numberTimestamp(value: unknown, fallback = Date.now()) {
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }

  return fallback
}

function chainIdFrom(input: FlashChainInput) {
  if (input && typeof input === 'object') return chainIdFrom(input.chainId ?? input.id)

  const parsed =
    typeof input === 'string' && input.toLowerCase().startsWith('0x')
      ? Number.parseInt(input, 16)
      : Number(input)

  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

function resolveChainId(request: FlashQuoteRequest) {
  return (
    chainIdFrom(request.chainId) ||
    chainIdFrom(request.targetChain) ||
    chainIdFrom(request.contraChain) ||
    Number(objectPayload(request.targetAsset).chainId) ||
    Number(objectPayload(request.contraAsset).chainId) ||
    0
  )
}

function chainIdFromSlug(input: unknown) {
  if (typeof input === 'number') return input
  if (typeof input !== 'string') return undefined

  const normalized = input.trim().toLowerCase()
  if (FLASH_CHAIN_IDS_BY_SLUG[normalized]) return FLASH_CHAIN_IDS_BY_SLUG[normalized]

  const parsed = Number(normalized)
  if (Number.isInteger(parsed) && parsed > 0) return parsed

  const caipChainId = normalized.match(/(?:^|:)(\d+)$/)?.[1]
  const caipParsed = Number(caipChainId)

  return Number.isInteger(caipParsed) && caipParsed > 0 ? caipParsed : undefined
}

function requireSupportedChainId(chainId: number) {
  if (!isFlashChainSupported(chainId, runtime())) {
    throw new Error(`Flash does not support chain ${chainId} for this runtime`)
  }

  return chainId
}

function requireSide(side?: FlashTradeSide) {
  if (side !== 'buy' && side !== 'sell') throw new Error('Unsupported Flash trade side')

  return side
}

function resolveAsset(input: FlashAssetInput, label: string): FlashAsset {
  if (input && typeof input === 'object') return input

  throw new Error(`Unsupported Flash ${label} asset`)
}

function statusPayload(orderId: string, status: FlashOrderStatus, raw?: unknown) {
  return {
    orderId,
    status: toRawStatus(status),
    normalizedStatus: status,
    source: 'flash',
    provider: 'flash',
    raw
  }
}

function normalizeStatus(status: unknown): FlashOrderStatus {
  const normalized = String(status || 'accepted')
    .trim()
    .toLowerCase()
    .replace(/^order_status_/, '')
    .replace(/_/g, '-')

  if (normalized === 'canceled') return 'cancelled'
  if (
    normalized === 'open' ||
    normalized === 'active' ||
    normalized === 'working' ||
    normalized === 'created'
  ) {
    return 'accepted'
  }
  if (
    terminalStatuses.has(normalized as FlashOrderStatus) ||
    openStatuses.has(normalized as FlashOrderStatus)
  ) {
    return normalized as FlashOrderStatus
  }

  return 'accepted'
}

function toRawStatus(status: FlashOrderStatus) {
  return `ORDER_STATUS_${status.replace(/-/g, '_').toUpperCase()}`
}

function isOpenStatus(status: FlashOrderStatus) {
  return openStatuses.has(status)
}

function isTerminalStatus(status: FlashOrderStatus) {
  return terminalStatuses.has(status)
}

export function setFlashPositionSync(sync?: FlashPositionSync) {
  positionSync = sync || null
}

function orderPositionTokens(record: FlashOrderRecord) {
  const tokens = new Map<string, Token>()
  const affectedAssets = [record.spentAsset, record.receiveAsset]

  affectedAssets.forEach((asset) => {
    const address = (asset.address || '').trim().toLowerCase()
    if (asset.isNative || !/^0x[0-9a-f]{40}$/.test(address)) return

    const token = {
      address,
      chainId: asset.chainId || record.chainId,
      decimals: asset.decimals,
      name: asset.name || asset.symbol,
      symbol: asset.symbol
    }

    tokens.set(`${token.chainId}:${address}`, token)
  })

  return [...tokens.values()]
}

function positionTokenIds(record: FlashOrderRecord) {
  return orderPositionTokens(record)
    .map((token) => `${token.chainId}:${token.address}`)
    .sort()
    .join(',')
}

function shouldTrackOrderPositions(previous: FlashOrderRecord | undefined, record: FlashOrderRecord) {
  return (
    !previous ||
    previous.accountAddress !== record.accountAddress ||
    previous.chainId !== record.chainId ||
    positionTokenIds(previous) !== positionTokenIds(record)
  )
}

function shouldRefreshOrderPositions(previous: FlashOrderRecord | undefined, record: FlashOrderRecord) {
  if (record.status !== 'partially-filled' && !isTerminalStatus(record.status)) return false
  if (!previous || previous.status !== record.status) return true

  return (
    previous.filledOutputAmount !== record.filledOutputAmount ||
    previous.fillHash !== record.fillHash ||
    previous.fillTransactionHash !== record.fillTransactionHash
  )
}

function syncOrderPositions(previous: FlashOrderRecord | undefined, record: FlashOrderRecord) {
  if (!positionSync) return

  const update = {
    address: record.accountAddress,
    chainId: record.chainId,
    tokens: orderPositionTokens(record)
  }

  try {
    if (shouldTrackOrderPositions(previous, record)) positionSync.track(update)
    if (shouldRefreshOrderPositions(previous, record)) positionSync.refresh(update)
  } catch (error) {
    console.warn('could not sync positions for Flash order', { orderId: record.orderId }, error)
  }
}

function normalizePercent(value?: string | number) {
  if (value === undefined || value === null || String(value).trim() === '') return undefined

  const parsed = Number(normalizeAmount(value))

  if (!Number.isFinite(parsed) || parsed < 0) return undefined

  return (parsed / 100).toString()
}

function optionalString(value: unknown) {
  const clean = normalizeAmount(value as string | number)

  return clean || undefined
}

function optionalInteger(value: unknown, label: string, { max, min }: { max?: number; min?: number } = {}) {
  if (value === undefined || value === null || String(value).trim() === '') return undefined

  const parsed = Number(normalizeAmount(value as string | number))
  if (
    !Number.isInteger(parsed) ||
    (min !== undefined && parsed < min) ||
    (max !== undefined && parsed > max)
  ) {
    const range = [min, max].filter((boundary) => boundary !== undefined).join(' to ')
    throw new Error(`Flash ${label} must be an integer${range ? ` from ${range}` : ''}`)
  }

  return parsed
}

function normalizeTrigger(trigger: FlashPriceTriggerInput) {
  const notionalPrice = optionalString(trigger.notionalPrice)

  if (!notionalPrice || (trigger.triggerType !== 'lower' && trigger.triggerType !== 'upper')) {
    throw new Error('Flash triggers require a notional price and lower or upper trigger type')
  }

  return { notionalPrice, triggerType: trigger.triggerType }
}

function normalizeTriggers(request: FlashQuoteRequest, orderType: FlashOrderType) {
  if (request.triggers) {
    if (request.triggers.length > 2) throw new Error('Flash supports at most two price triggers')

    return request.triggers.map(normalizeTrigger)
  }

  const triggerNotionalPrice = optionalString(request.triggerNotionalPrice)
  const stopLossNotionalPrice = optionalString(request.stopLossNotionalPrice)
  const takeProfitNotionalPrice = optionalString(request.takeProfitNotionalPrice)

  if (orderType === 'stop' && triggerNotionalPrice) {
    return [{ notionalPrice: triggerNotionalPrice, triggerType: 'upper' as const }]
  }
  if (orderType === 'stop-loss' && (stopLossNotionalPrice || triggerNotionalPrice)) {
    return [
      {
        notionalPrice: stopLossNotionalPrice || triggerNotionalPrice || '',
        triggerType: 'lower' as const
      }
    ]
  }
  if (orderType === 'take-profit' && (takeProfitNotionalPrice || triggerNotionalPrice)) {
    return [
      {
        notionalPrice: takeProfitNotionalPrice || triggerNotionalPrice || '',
        triggerType: 'upper' as const
      }
    ]
  }
  if (orderType === 'bracket' && stopLossNotionalPrice && takeProfitNotionalPrice) {
    return [
      { notionalPrice: stopLossNotionalPrice, triggerType: 'lower' as const },
      { notionalPrice: takeProfitNotionalPrice, triggerType: 'upper' as const }
    ]
  }

  return undefined
}

export function buildFlashQuoteBody(request: FlashQuoteRequest) {
  const chainId = requireSupportedChainId(resolveChainId(request))
  const targetAsset = resolveAsset(request.targetAsset, 'target')
  const contraAsset = resolveAsset(request.contraAsset, 'contra')
  const side = requireSide(request.side)
  const qty = normalizeAmount(request.qty || request.inputAmount)
  const orderType = request.orderType || FLASH_MARKET_ORDER_TYPE
  const maxSlippage = normalizePercent(request.slippage)
  const maxPriceImpact = normalizePercent(request.maxPriceImpact)
  const durationSeconds =
    orderType === 'twap'
      ? optionalInteger(request.durationSeconds, 'durationSeconds', { min: 300 })
      : undefined
  const twapBucketCount =
    orderType === 'twap'
      ? optionalInteger(request.twapBucketCount, 'twapBucketCount', { min: 2, max: 2560 })
      : undefined
  const isTriggerOrder = ['stop', 'stop-loss', 'take-profit', 'bracket'].includes(orderType)
  const triggers = isTriggerOrder ? normalizeTriggers(request, orderType) : undefined
  const supportsExpiry = orderType === 'limit' || isTriggerOrder
  const supportsLimitPrice =
    orderType === 'limit' || orderType === 'stop' || orderType === 'stop-loss' || orderType === 'take-profit'

  if (!request.accountAddress) throw new Error('Flash quote requires an account address')
  if (!qty || Number(qty) <= 0) throw new Error('Flash quote requires a positive qty')

  return {
    funderAddress: request.accountAddress,
    targetChain: getFlashChainSlug(chainId),
    contraChain: getFlashChainSlug(chainId),
    targetAsset: toFlashApiAssetAddress(targetAsset),
    contraAsset: toFlashApiAssetAddress(contraAsset),
    side,
    qty,
    orderType,
    ...(maxSlippage ? { maxSlippage } : {}),
    ...(maxPriceImpact ? { maxPriceImpact } : {}),
    ...(orderType === FLASH_MARKET_ORDER_TYPE && request.quickTrade ? { quickTrade: true } : {}),
    ...(supportsLimitPrice && optionalString(request.limitNotionalPrice)
      ? { limitNotionalPrice: optionalString(request.limitNotionalPrice) }
      : {}),
    ...(supportsExpiry && request.expireTime?.trim() ? { expireTime: request.expireTime.trim() } : {}),
    ...(durationSeconds !== undefined ? { durationSeconds } : {}),
    ...(twapBucketCount !== undefined ? { twapBucketCount } : {}),
    ...(triggers?.length ? { triggers } : {})
  }
}

function normalizeTx(tx: unknown, fallbackChainId: number): FlashQuoteTransactionRequest | null {
  const record = objectPayload(tx)
  const to = stringValue(record.to)
  const data = stringValue(record.data, '0x')

  if (!to) return null

  return {
    chainId: chainIdFromSlug(record.chainId) || fallbackChainId,
    ...(record.from ? { from: stringValue(record.from) } : {}),
    to,
    data,
    value: stringValue(record.value, '0x0')
  }
}

function quoteAction({
  amount,
  amountRaw,
  asset,
  fallbackChainId,
  kind,
  label,
  spender,
  tx
}: {
  amount: string
  amountRaw: string
  asset: FlashAsset
  fallbackChainId: number
  kind: 'wrap' | 'approve'
  label: string
  spender?: string
  tx: unknown
}): FlashQuoteAction | null {
  const normalizedTx = normalizeTx(tx, fallbackChainId)
  if (!normalizedTx) return null

  return {
    id: kind,
    kind,
    label,
    asset,
    amount,
    amountRaw,
    ...(spender ? { spender } : {}),
    tx: normalizedTx
  }
}

function normalizeFees(rawFees: unknown, spentAsset: FlashAsset) {
  if (!Array.isArray(rawFees)) {
    const estimatedFeeNotional = optionalString(objectPayload(rawFees).estimatedFeeNotional)

    return estimatedFeeNotional
      ? [{ label: 'Estimated fee (USD)', amount: estimatedFeeNotional } satisfies FlashQuoteFee]
      : []
  }

  return rawFees.map((fee): FlashQuoteFee => {
    const record = objectPayload(fee)

    return {
      label: stringValue(record.label || record.name, 'Flash fee'),
      amount: stringValue(record.amount || record.value, '0'),
      asset: spentAsset
    }
  })
}

function parseTypedData(value: unknown) {
  if (typeof value !== 'string') return value || null

  const clean = value.trim()
  if (!clean) return null

  try {
    const parsed = JSON.parse(clean)

    return parsed && typeof parsed === 'object' ? parsed : value
  } catch {
    return value
  }
}

function serializeTypedData(value: unknown) {
  if (typeof value === 'string') return value.trim() ? value : undefined
  if (!value || typeof value !== 'object') return undefined

  return JSON.stringify(value)
}

export function normalizeFlashQuoteResponse(raw: unknown, request: FlashQuoteRequest) {
  const chainId = requireSupportedChainId(resolveChainId(request))
  const payload = objectPayload(raw)
  const quotePayload = objectPayload(payload.quote || payload)
  const targetAsset = resolveAsset(request.targetAsset, 'target')
  const contraAsset = resolveAsset(request.contraAsset, 'contra')
  const side = requireSide(request.side)
  const orderType = (request.orderType || FLASH_MARKET_ORDER_TYPE) as FlashOrderType
  const spentAsset = getSpentAsset({ side, targetAsset, contraAsset })
  const receiveAsset = getReceiveAsset({ side, targetAsset, contraAsset })
  const fromPayload = objectPayload(quotePayload.from)
  const toPayload = objectPayload(quotePayload.to)
  const inputAmount = stringValue(
    fromPayload.amount || quotePayload.inputAmount || quotePayload.qty || request.qty || request.inputAmount
  )
  const outputAmount = stringValue(
    toPayload.amount ||
      quotePayload.outputAmount ||
      quotePayload.estimatedOutputAmount ||
      quotePayload.toAmount,
    '0'
  )
  const inputNotional = stringValue(
    fromPayload.notional || quotePayload.inputNotional || quotePayload.fromNotional
  )
  const outputNotional = stringValue(
    toPayload.notional || quotePayload.outputNotional || quotePayload.toNotional
  )
  const estimatedFeeNotional = stringValue(objectPayload(quotePayload.fees).estimatedFeeNotional)
  const targetLeg =
    fromPayload.asset === 'target' || (fromPayload.asset === undefined && side === 'sell')
      ? { amount: inputAmount, notional: inputNotional }
      : { amount: outputAmount, notional: outputNotional }
  const targetAmountNumber = Number(targetLeg.amount)
  const targetNotionalNumber = Number(targetLeg.notional)
  const targetNotionalPrice =
    Number.isFinite(targetAmountNumber) && targetAmountNumber > 0 && Number.isFinite(targetNotionalNumber)
      ? String(targetNotionalNumber / targetAmountNumber)
      : ''
  const quoteId = stringValue(quotePayload.quoteId || quotePayload.id || payload.quoteId || payload.id)
  const wrapPayload = objectPayload(quotePayload.wrap || objectPayload(quotePayload.actions).wrap)
  const evmPayload = objectPayload(quotePayload.evm || objectPayload(quotePayload.actions).evm)
  const approvalPayload = objectPayload(
    quotePayload.approval || objectPayload(quotePayload.actions).approval || evmPayload.approval
  )
  const orderTypedDataSource =
    evmPayload.orderTypedData ||
    quotePayload.orderTypedData ||
    objectPayload(quotePayload.actions).orderTypedData ||
    null
  const permitTypedDataSource = evmPayload.permitTypedData || null
  const wrappedAssetAddress = stringValue(wrapPayload.wrappedAsset).trim()
  const approvalAsset =
    (wrappedAssetAddress
      ? getFlashAssetsForChain(chainId).find(
          (asset) => normalizeAddress(toFlashApiAssetAddress(asset)) === normalizeAddress(wrappedAssetAddress)
        )
      : null) || spentAsset
  const wrapAction = quoteAction({
    amount: stringValue(wrapPayload.amount || inputAmount),
    amountRaw: stringValue(wrapPayload.amountRaw || wrapPayload.amountWei || '0'),
    asset: spentAsset,
    fallbackChainId: chainId,
    kind: 'wrap',
    label: stringValue(wrapPayload.label, `Wrap ${spentAsset.symbol}`),
    tx: wrapPayload.evmTx || wrapPayload.tx
  })
  const approvalAction = quoteAction({
    amount: stringValue(approvalPayload.amount || inputAmount),
    amountRaw: stringValue(approvalPayload.amountRaw || approvalPayload.amountWei || '0'),
    asset: approvalAsset,
    fallbackChainId: chainId,
    kind: 'approve',
    label: stringValue(approvalPayload.label, `Approve ${approvalAsset.symbol}`),
    spender: stringValue(approvalPayload.spender),
    tx: approvalPayload.evmTx || approvalPayload.tx || evmPayload.approveTx
  })
  const steps: FlashStep[] = []

  if (wrapAction)
    steps.push({ id: 'wrap', kind: 'wrap', label: wrapAction.label, status: 'required', asset: spentAsset })
  if (approvalAction) {
    steps.push({
      id: 'approve',
      kind: 'approve',
      label: approvalAction.label,
      status: 'required',
      asset: approvalAsset
    })
  }

  steps.push(
    {
      id: 'sign',
      kind: 'sign',
      label: 'Sign order',
      status: 'required'
    },
    {
      id: 'submit',
      kind: 'submit',
      label: orderType === FLASH_MARKET_ORDER_TYPE ? 'Submit trade' : 'Submit order',
      status: 'required'
    }
  )

  const quote: FlashQuote & { inputNotional: string; outputNotional: string } = {
    id: quoteId,
    side,
    orderType,
    targetAsset,
    contraAsset,
    spentAsset,
    receiveAsset,
    inputAmount,
    inputNotional,
    outputAmount,
    outputNotional,
    estimatedFeeNotional,
    targetNotionalPrice,
    from: {
      asset: stringValue(fromPayload.asset, side === 'buy' ? 'contra' : 'target') as 'target' | 'contra',
      amount: inputAmount,
      notional: inputNotional
    },
    to: {
      asset: stringValue(toPayload.asset, side === 'buy' ? 'target' : 'contra') as 'target' | 'contra',
      amount: outputAmount,
      notional: outputNotional
    },
    rate: stringValue(quotePayload.rate || quotePayload.price || ''),
    fees: normalizeFees(quotePayload.fees, spentAsset),
    steps,
    actions: {
      wrap: wrapAction,
      approval: approvalAction
    },
    expiresAt: stringValue(quotePayload.expiresAt || quotePayload.expires_at || ''),
    raw: {
      ...quotePayload,
      from: {
        ...fromPayload,
        asset: stringValue(fromPayload.asset, side === 'buy' ? 'contra' : 'target'),
        amount: inputAmount,
        notional: inputNotional
      },
      to: {
        ...toPayload,
        asset: stringValue(toPayload.asset, side === 'buy' ? 'target' : 'contra'),
        amount: outputAmount,
        notional: outputNotional
      },
      evm: {
        ...evmPayload,
        orderTypedData: parseTypedData(orderTypedDataSource),
        orderTypedDataRaw: serializeTypedData(orderTypedDataSource) || null,
        permitTypedData: parseTypedData(permitTypedDataSource),
        permitTypedDataRaw: serializeTypedData(permitTypedDataSource) || null
      }
    }
  }

  return quote
}

async function flashRequest(path: string, init: RequestInit = {}) {
  const url = new URL(`${flashBaseUrl()}${path}`)
  const response = await fetch(url, {
    ...init,
    headers: {
      ...flashHeaders(),
      ...(init.headers || {})
    }
  })
  const contentType = response.headers.get('content-type') || ''
  const payload = contentType.includes('application/json') ? await response.json() : await response.text()

  if (!response.ok) {
    const message =
      typeof payload === 'string'
        ? payload
        : stringValue(objectPayload(payload).message || objectPayload(payload).error, response.statusText)
    throw new Error(`Flash API ${response.status} ${response.statusText}: ${message}`)
  }

  return payload
}

function storeOrders() {
  return (store('main.orders') || {}) as Record<string, FlashOrderRecord>
}

function titleize(value: string) {
  return String(value || '')
    .replace(/-/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ')
}

function assetSymbol(asset?: FlashAsset) {
  return asset?.symbol || 'asset'
}

function orderNotificationId(orderId: string) {
  return `flash-order:${orderId}`
}

function orderNotificationTitle(record: FlashOrderRecord) {
  const side = titleize(record.side || 'trade')
  const type = titleize(record.orderType || 'order')

  return `${side} ${assetSymbol(record.targetAsset)} ${type} Order`
}

function orderNotificationDetail(record: FlashOrderRecord, status: FlashOrderStatus = record.status) {
  const outputAmount = record.filledOutputAmount || record.outputAmount || record.estimatedOutputAmount
  const flow = `${record.spentAmount} ${assetSymbol(record.spentAsset)} -> ${outputAmount} ${assetSymbol(
    record.receiveAsset
  )}`

  if (status === 'filled') return `Filled ${flow}`
  if (status === 'cancelled') return `Cancelled ${flow}`
  if (status === 'rejected') return `Rejected ${flow}`
  if (status === 'expired') return `Expired ${flow}`
  if (status === 'terminated') return `Terminated ${flow}`

  return flow
}

function orderNotificationTarget(record: FlashOrderRecord) {
  return {
    type: 'flashOrder',
    orderId: record.orderId,
    account: record.accountAddress,
    chainId: record.chainId,
    chainType: 'ethereum'
  }
}

function orderNotificationMetadata(record: FlashOrderRecord) {
  return {
    orderId: record.orderId,
    status: record.status,
    rawStatus: record.rawStatus,
    orderType: record.orderType,
    side: record.side
  }
}

function upsertPendingOrderNotification(record: FlashOrderRecord, now = Date.now()) {
  const createdAt = record.createdAt || now

  store.upsertPendingNotification({
    id: orderNotificationId(record.orderId),
    state: 'pending',
    title: orderNotificationTitle(record),
    detail: orderNotificationDetail(record),
    createdAt,
    updatedAt: now,
    expiresAt: createdAt + FLASH_MARKET_ORDER_NOTIFICATION_MS,
    leadingIcon: {
      chainType: 'ethereum',
      chainId: record.chainId
    },
    target: orderNotificationTarget(record),
    metadata: orderNotificationMetadata(record)
  })
}

function terminalOrderNotificationState(record: FlashOrderRecord) {
  return record.status === 'filled' ? 'completed' : 'failed'
}

function resolveOrderNotification(record: FlashOrderRecord, now = Date.now()) {
  if (!isTerminalStatus(record.status)) return

  store.resolveNotification(orderNotificationId(record.orderId), terminalOrderNotificationState(record), {
    title: orderNotificationTitle(record),
    detail: orderNotificationDetail(record, record.status),
    expiresAt: now + FLASH_RESOLVED_ORDER_NOTIFICATION_MS,
    updatedAt: now,
    target: orderNotificationTarget(record),
    metadata: orderNotificationMetadata(record)
  })
}

function dropOrderNotification(orderId: string) {
  store.expireNotification(orderNotificationId(orderId))
}

function terminalWithinNotificationWindow(record: FlashOrderRecord, deadline: number) {
  return isTerminalStatus(record.status) && (!record.terminalAt || record.terminalAt <= deadline)
}

function orderAssetFromReference(value: unknown, fallback?: FlashAsset | null): FlashAsset | null {
  const asset = objectPayload(value)

  if (
    typeof asset.id === 'string' &&
    typeof asset.symbol === 'string' &&
    Number.isInteger(Number(asset.chainId)) &&
    Number.isInteger(Number(asset.decimals))
  ) {
    return asset as FlashAsset
  }

  const chain = objectPayload(asset.chain)
  const chainId =
    chainIdFromSlug(asset.chainId) ||
    chainIdFromSlug(chain.id) ||
    chainIdFromSlug(chain.name) ||
    fallback?.chainId
  const address = stringValue(asset.address || fallback?.address).trim()

  if (!chainId || !address) return fallback || null

  const normalizedAddress = normalizeAddress(address)
  const fallbackMatches =
    fallback &&
    fallback.chainId === chainId &&
    normalizeAddress(toFlashApiAssetAddress(fallback)) === normalizedAddress
      ? fallback
      : null
  const knownAsset = getFlashAssetsForChain(chainId).find(
    (candidate) => normalizeAddress(toFlashApiAssetAddress(candidate)) === normalizedAddress
  )
  const metadata = fallbackMatches || knownAsset
  const decimals = Number(asset.decimals)
  const isNative = normalizedAddress === normalizeAddress(FLASH_NATIVE_ETH_TOKEN_ADDRESS)

  return {
    id: metadata?.id || flashAssetId(chainId, address),
    symbol: stringValue(asset.ticker || asset.symbol || metadata?.symbol, 'ASSET'),
    name: stringValue(asset.name || metadata?.name || asset.ticker || asset.symbol, 'Unknown asset'),
    decimals: Number.isInteger(decimals) && decimals >= 0 ? decimals : (metadata?.decimals ?? 18),
    chainId,
    isNative,
    address
  }
}

function rawOrderQuote(raw: Record<string, any>) {
  return objectPayload(raw.quote || raw.flashQuote || raw.quotePayload)
}

function fallbackQuoteFromRecord(record?: FlashOrderRecord | null): FlashQuote | null {
  if (!record) return null

  return {
    id: record.quoteId,
    side: record.side as FlashTradeSide,
    orderType: record.orderType as FlashOrderType,
    targetAsset: record.targetAsset,
    contraAsset: record.contraAsset,
    spentAsset: record.spentAsset,
    receiveAsset: record.receiveAsset,
    inputAmount: record.spentAmount,
    outputAmount: record.estimatedOutputAmount || record.outputAmount,
    rate: record.rate,
    fees: [],
    steps: [],
    raw: record.rawPayload
  }
}

function recordFromQuote({
  orderId,
  quote,
  raw,
  request,
  status = 'accepted'
}: {
  orderId: string
  quote: FlashQuote
  raw?: unknown
  request: FlashSubmitOrderRequest
  status?: FlashOrderStatus
}): FlashOrderRecord {
  const now = Date.now()
  const run = runtime()
  const open = isOpenStatus(status)

  return {
    orderId,
    accountAddress: normalizeAddress(request.accountAddress),
    chainId: quote.targetAsset.chainId || quote.contraAsset.chainId,
    provider: 'flash',
    source: 'flash',
    environment: run.environment,
    profile: run.profile,
    status,
    rawStatus: toRawStatus(status),
    orderType: quote.orderType,
    side: quote.side,
    targetAsset: quote.targetAsset,
    contraAsset: quote.contraAsset,
    qty: quote.inputAmount,
    spentAsset: quote.spentAsset,
    spentAmount: quote.inputAmount,
    outputAmount: quote.outputAmount,
    estimatedOutputAmount: quote.outputAmount,
    filledOutputAmount: null,
    averageFillPrice: null,
    createdAt: now,
    updatedAt: now,
    terminalAt: isTerminalStatus(status) ? now : null,
    open,
    cancellable: open,
    quoteId: request.quoteId || quote.id,
    receiveAsset: quote.receiveAsset,
    rate: quote.rate,
    rawPayload: {
      ...objectPayload(request.rawPayload),
      quote,
      signature: request.orderSignature || request.signature || null,
      response: raw || null
    },
    rawStatusPayload: statusPayload(orderId, status, raw),
    fillHash: null,
    fillTransactionHash: null
  }
}

function normalizeOrderRecord(rawOrder: unknown, fallback?: FlashOrderRecord | null) {
  const raw = objectPayload(rawOrder)
  const orderId = stringValue(raw.orderId || raw.id || fallback?.orderId)
  if (!orderId) throw new Error('Flash order response did not include an order id')

  const now = Date.now()
  const status = normalizeStatus(raw.normalizedStatus || raw.status || fallback?.status)
  const quote = rawOrderQuote(raw)
  const fallbackQuote = fallbackQuoteFromRecord(fallback)
  const quotedTargetAsset = objectPayload(quote.targetAsset).id ? (quote.targetAsset as FlashAsset) : null
  const quotedContraAsset = objectPayload(quote.contraAsset).id ? (quote.contraAsset as FlashAsset) : null
  const targetAsset = orderAssetFromReference(raw.targetAsset, quotedTargetAsset || fallback?.targetAsset)
  const contraAsset = orderAssetFromReference(raw.contraAsset, quotedContraAsset || fallback?.contraAsset)
  const side = (quote.side || raw.side || fallback?.side || 'sell') as FlashTradeSide
  const orderType = (quote.orderType ||
    raw.orderType ||
    fallback?.orderType ||
    FLASH_MARKET_ORDER_TYPE) as FlashOrderType

  if (!targetAsset || !contraAsset) {
    if (fallback) {
      return {
        ...fallback,
        status,
        rawStatus: toRawStatus(status),
        updatedAt: numberTimestamp(raw.updatedAt || raw.updated_at, now),
        terminalAt: isTerminalStatus(status) ? fallback.terminalAt || now : null,
        open: isOpenStatus(status),
        cancellable: Boolean(
          raw.cancellable ?? (isOpenStatus(status) && orderType !== FLASH_MARKET_ORDER_TYPE)
        ),
        rawPayload: {
          ...objectPayload(fallback.rawPayload),
          response: raw
        },
        rawStatusPayload: statusPayload(orderId, status, raw),
        fillHash: stringValue(
          raw.fillHash || raw.fillTransactionHash || raw.transactionHash || fallback.fillHash
        ),
        fillTransactionHash: stringValue(
          raw.fillTransactionHash || raw.fillHash || raw.transactionHash || fallback.fillTransactionHash
        )
      }
    }

    throw new Error(`Flash order ${orderId} is missing asset metadata`)
  }

  const filled = objectPayload(raw.filled)
  const officialFilledOutputAmount = stringValue(side === 'buy' ? filled.targetAmount : filled.contraAmount)
  const officialAverageFillPrice = stringValue(filled.averageNotionalPrice || filled.averagePrice)
  const quoteLike =
    fallbackQuote ||
    ({
      id: stringValue(quote.quoteId || quote.id || raw.quoteId),
      side,
      orderType,
      targetAsset,
      contraAsset,
      spentAsset: getSpentAsset({ side, targetAsset, contraAsset }),
      receiveAsset: getReceiveAsset({ side, targetAsset, contraAsset }),
      inputAmount: stringValue(
        quote.inputAmount || quote.qty || raw.spentAmount || raw.inputAmount || raw.qty,
        '0'
      ),
      outputAmount: stringValue(
        quote.outputAmount ||
          quote.estimatedOutputAmount ||
          raw.outputAmount ||
          raw.estimatedOutputAmount ||
          officialFilledOutputAmount,
        '0'
      ),
      rate: stringValue(quote.rate || raw.rate || officialAverageFillPrice),
      fees: [],
      steps: [],
      raw: quote
    } satisfies FlashQuote)
  const open = isOpenStatus(status)
  const filledOutputAmount = stringValue(
    raw.filledOutputAmount || raw.filledAmount || officialFilledOutputAmount || fallback?.filledOutputAmount
  )
  const fillHash = stringValue(
    raw.fillHash || raw.fillTransactionHash || raw.transactionHash || fallback?.fillHash
  )
  const createdAt = numberTimestamp(
    raw.createdAt || raw.created_at || raw.placedAt,
    fallback?.createdAt || now
  )
  const updatedAt = numberTimestamp(
    raw.updatedAt || raw.updated_at || raw.closedAt || raw.acceptedAt || raw.placedAt,
    now
  )
  const closedAt = raw.closedAt ? numberTimestamp(raw.closedAt, updatedAt) : null

  return {
    ...(fallback || {}),
    orderId,
    accountAddress: normalizeAddress(
      raw.accountAddress || raw.funderAddress || raw.account || fallback?.accountAddress
    ),
    chainId:
      chainIdFromSlug(raw.chain || raw.chainId || raw.targetChain) ||
      quoteLike.targetAsset.chainId ||
      quoteLike.contraAsset.chainId,
    provider: 'flash',
    source: 'flash',
    environment: fallback?.environment || runtime().environment,
    profile: fallback?.profile || runtime().profile,
    status,
    rawStatus: toRawStatus(status),
    orderType,
    side,
    targetAsset: quoteLike.targetAsset,
    contraAsset: quoteLike.contraAsset,
    qty: stringValue(
      raw.qty || fallback?.qty || (side === 'buy' ? quoteLike.outputAmount : quoteLike.inputAmount)
    ),
    spentAsset: quoteLike.spentAsset,
    spentAmount: stringValue(raw.spentAmount || raw.inputAmount || raw.qty || quoteLike.inputAmount),
    outputAmount: stringValue(raw.outputAmount || quoteLike.outputAmount),
    estimatedOutputAmount: stringValue(raw.estimatedOutputAmount || quoteLike.outputAmount),
    filledOutputAmount: filledOutputAmount || null,
    averageFillPrice:
      stringValue(raw.averageFillPrice || officialAverageFillPrice || fallback?.averageFillPrice) || null,
    createdAt,
    updatedAt,
    terminalAt: isTerminalStatus(status) ? closedAt || fallback?.terminalAt || updatedAt : null,
    open,
    cancellable: Boolean(raw.cancellable ?? (open && orderType !== FLASH_MARKET_ORDER_TYPE)),
    quoteId: stringValue(raw.quoteId || quoteLike.id || fallback?.quoteId),
    receiveAsset: quoteLike.receiveAsset,
    rate: stringValue(raw.rate || quoteLike.rate || fallback?.rate),
    rawPayload: {
      ...objectPayload(fallback?.rawPayload),
      quote: quoteLike,
      response: raw
    },
    rawStatusPayload: statusPayload(orderId, status, raw),
    fillHash: fillHash || null,
    fillTransactionHash: fillHash || null
  } satisfies FlashOrderRecord
}

function upsertRecord(record: FlashOrderRecord) {
  const previous = getRecord(record.orderId)
  store.upsertOrder(record)
  syncOrderPositions(previous, record)
  return record
}

function updateRecord(orderId: string, record: FlashOrderRecord) {
  const existing = storeOrders()[orderId]

  if (existing) store.updateOrder(orderId, record)
  else store.upsertOrder(record)

  syncOrderPositions(existing, record)

  return record
}

function getRecord(orderId: string) {
  return storeOrders()[orderId]
}

function hasOpenOrders() {
  return Object.values(storeOrders()).some((order) => isOpenStatus(order.status))
}

function stopMarketOrderPolling(orderId: string) {
  const poller = marketOrderPollers.get(orderId)
  if (poller?.timer) clearTimeout(poller.timer)
  marketOrderPollers.delete(orderId)
}

function scheduleMarketOrderPoll(orderId: string, poller: FlashMarketOrderPoller) {
  if (!marketOrderPollers.has(orderId)) return

  poller.timer = setTimeout(() => {
    void pollMarketOrder(orderId, poller)
  }, FLASH_MARKET_ORDER_POLL_MS)
}

async function pollMarketOrder(orderId: string, poller: FlashMarketOrderPoller) {
  const current = getRecord(orderId)

  if (!current) {
    dropOrderNotification(orderId)
    stopMarketOrderPolling(orderId)
    ensureOpenOrderPolling()
    return
  }

  if (current.orderType !== FLASH_MARKET_ORDER_TYPE) {
    stopMarketOrderPolling(orderId)
    ensureOpenOrderPolling()
    return
  }

  if (isTerminalStatus(current.status)) {
    if (terminalWithinNotificationWindow(current, poller.deadline)) resolveOrderNotification(current)
    else dropOrderNotification(orderId)

    stopMarketOrderPolling(orderId)
    ensureOpenOrderPolling()
    return
  }

  if (Date.now() >= poller.deadline) {
    dropOrderNotification(orderId)
    stopMarketOrderPolling(orderId)
    ensureOpenOrderPolling()
    return
  }

  let latest = current

  try {
    latest = await fetchOrderRecord(current)
  } catch (error) {
    console.error('error polling Flash market order', error)
  }

  if (isTerminalStatus(latest.status)) {
    if (terminalWithinNotificationWindow(latest, poller.deadline)) resolveOrderNotification(latest)
    else dropOrderNotification(orderId)

    stopMarketOrderPolling(orderId)
    ensureOpenOrderPolling()
    return
  }

  upsertPendingOrderNotification(latest)
  scheduleMarketOrderPoll(orderId, poller)
}

function startMarketOrderPolling(record: FlashOrderRecord) {
  if (record.orderType !== FLASH_MARKET_ORDER_TYPE) return

  const now = Date.now()
  upsertPendingOrderNotification(record, now)

  if (isTerminalStatus(record.status)) {
    resolveOrderNotification(record, now)
    return
  }

  if (marketOrderPollers.has(record.orderId)) return

  const poller = {
    deadline: (record.createdAt || now) + FLASH_MARKET_ORDER_NOTIFICATION_MS
  }

  marketOrderPollers.set(record.orderId, poller)
  void pollMarketOrder(record.orderId, poller)
}

export function stopOpenOrderPolling() {
  if (!openOrderPoller) return

  clearInterval(openOrderPoller)
  openOrderPoller = null
}

function ensureOpenOrderPolling() {
  if (!hasOpenOrders()) {
    stopOpenOrderPolling()
    return
  }

  if (openOrderPoller) return

  openOrderPoller = setInterval(() => {
    void refreshOpenOrders()
      .catch((error) => {
        console.error('error refreshing Flash open orders', error)
      })
      .finally(() => {
        ensureOpenOrderPolling()
      })
  }, FLASH_OPEN_ORDER_POLL_MS)
}

export function startOpenOrderPolling() {
  ensureOpenOrderPolling()
}

function sortOrders(a: FlashOrderRecord, b: FlashOrderRecord) {
  if (a.open !== b.open) return a.open ? -1 : 1

  return Number(b.createdAt || 0) - Number(a.createdAt || 0)
}

async function fetchOrderRecord(fallback: FlashOrderRecord) {
  const params = new URLSearchParams({ funderAddress: fallback.accountAddress })
  const raw = await flashRequest(`/orders/${encodeURIComponent(fallback.orderId)}?${params}`)
  const record = normalizeOrderRecord(objectPayload(raw).order || raw, fallback)

  updateRecord(record.orderId, record)
  if (isTerminalStatus(record.status)) resolveOrderNotification(record)

  return record
}

export function refreshOpenOrders() {
  if (openOrderRefresh) return openOrderRefresh

  const openOrders = Object.values(storeOrders()).filter((order) => isOpenStatus(order.status))

  openOrderRefresh = Promise.all(
    openOrders.map(async (order) => {
      try {
        return await fetchOrderRecord(order)
      } catch (error) {
        console.error('error refreshing Flash open order', error)
        return order
      }
    })
  ).finally(() => {
    openOrderRefresh = null
  })

  return openOrderRefresh
}

export async function quote(request: FlashQuoteRequest) {
  const body = buildFlashQuoteBody(request)
  const raw = await flashRequest('/quote', {
    method: 'POST',
    body: JSON.stringify(body)
  })
  const normalizedQuote = normalizeFlashQuoteResponse(raw, request)

  return {
    ...runtime(),
    quote: normalizedQuote,
    flash: normalizedQuote.raw || raw
  }
}

function quoteTypedData(quote: FlashQuote, field: 'orderTypedData' | 'permitTypedData') {
  const evm = objectPayload(objectPayload(quote.raw).evm)

  return evm[`${field}Raw`] || evm[field]
}

export function buildFlashSubmitBody(request: FlashSubmitOrderRequest) {
  if (!request.quote) throw new Error('Flash order submit requires a quote')

  const quote = request.quote
  const chainId = quote.targetAsset.chainId || quote.contraAsset.chainId
  const quoteFields = buildFlashQuoteBody({
    ...request,
    chainId: request.chainId || chainId,
    contraAsset: request.contraAsset || quote.contraAsset,
    orderType: quote.orderType,
    qty: request.qty || request.inputAmount || quote.inputAmount,
    side: request.side || quote.side,
    targetAsset: request.targetAsset || quote.targetAsset
  })
  const evmOrderTypedData = serializeTypedData(
    request.evmOrderTypedData || quoteTypedData(quote, 'orderTypedData')
  )
  const evmPermitTypedData = serializeTypedData(
    request.evmPermitTypedData || quoteTypedData(quote, 'permitTypedData')
  )
  const quoteId = request.quoteId || quote.id
  const userSignature = request.orderSignature || request.signature
  const rawQuote = objectPayload(quote.raw)
  const wrap = objectPayload(rawQuote.wrap)
  const quotedTargetAsset =
    typeof rawQuote.targetAsset === 'string' && rawQuote.targetAsset.trim()
      ? rawQuote.targetAsset.trim()
      : quoteFields.targetAsset
  const quotedContraAsset =
    typeof rawQuote.contraAsset === 'string' && rawQuote.contraAsset.trim()
      ? rawQuote.contraAsset.trim()
      : quoteFields.contraAsset
  const wrappedAsset =
    typeof wrap.wrappedAsset === 'string' && wrap.wrappedAsset.trim() ? wrap.wrappedAsset.trim() : ''
  const targetAsset = wrappedAsset && quote.side === 'sell' ? wrappedAsset : quotedTargetAsset
  const contraAsset = wrappedAsset && quote.side === 'buy' ? wrappedAsset : quotedContraAsset
  const { durationSeconds: _durationSeconds, expireTime: _expireTime, ...submitFields } = quoteFields

  return {
    ...submitFields,
    targetAsset,
    contraAsset,
    ...(quoteId ? { quoteId } : {}),
    ...(userSignature ? { userSignature } : {}),
    ...(evmOrderTypedData ? { evmOrderTypedData } : {}),
    ...(evmPermitTypedData ? { evmPermitTypedData } : {}),
    ...(request.evmPermitSignature ? { evmPermitSignature: request.evmPermitSignature } : {})
  }
}

export async function submitOrder(request: FlashSubmitOrderRequest) {
  if (!request.quote) throw new Error('Flash order submit requires a quote')

  const body = buildFlashSubmitBody(request)
  const raw = await flashRequest('/order', {
    method: 'POST',
    body: JSON.stringify(body)
  })
  const payload = objectPayload(raw)
  const orderId = stringValue(payload.orderId || objectPayload(payload.order).orderId || payload.id)

  if (!orderId) throw new Error('Flash order submit did not return an order id')

  const fallback = recordFromQuote({
    orderId,
    quote: request.quote,
    raw,
    request,
    status: normalizeStatus(payload.status || objectPayload(payload.order).status)
  })
  const record = normalizeOrderRecord(payload.order || raw, fallback)
  const storedRecord = upsertRecord(record)

  if (storedRecord.orderType === FLASH_MARKET_ORDER_TYPE) startMarketOrderPolling(storedRecord)
  ensureOpenOrderPolling()

  return {
    ...runtime(),
    orderId,
    order: storedRecord,
    raw
  }
}

export async function listOrders(request: FlashListOrdersRequest = {}) {
  const params = new URLSearchParams()
  const accountAddress = request.accountAddress?.trim()

  if (!accountAddress) throw new Error('Flash order list requires an account address')

  params.set('funderAddress', accountAddress)
  if (request.status) {
    const statuses = Array.isArray(request.status) ? request.status : [request.status]
    params.set(
      'statuses',
      statuses
        .map((status) => {
          const value = String(status).trim()
          return value.toUpperCase().startsWith('ORDER_STATUS_')
            ? value.toUpperCase()
            : toRawStatus(normalizeStatus(value))
        })
        .join(',')
    )
  }
  if (Number.isInteger(request.pageSize) && Number(request.pageSize) > 0) {
    params.set('pageSize', String(Math.min(200, Number(request.pageSize))))
  }

  const search = params.toString()
  const raw = await flashRequest(`/orders${search ? `?${search}` : ''}`)
  const payload = objectPayload(raw)
  const rawOrders = Array.isArray(payload.orders) ? payload.orders : Array.isArray(raw) ? raw : []
  const orders = rawOrders
    .map((order) => {
      const orderId = stringValue(objectPayload(order).orderId || objectPayload(order).id)
      const fallback = orderId ? getRecord(orderId) : null
      const record = normalizeOrderRecord(order, fallback)
      upsertRecord(record)
      if (isTerminalStatus(record.status)) resolveOrderNotification(record)
      return record
    })
    .sort(sortOrders)

  ensureOpenOrderPolling()

  return {
    ...runtime(),
    orders,
    count: orders.length
  }
}

export async function getOrder(request: FlashGetOrderRequest) {
  const fallback = getRecord(request.orderId)
  const accountAddress = request.accountAddress?.trim() || fallback?.accountAddress

  if (!accountAddress) throw new Error('Flash order lookup requires an account address')

  const params = new URLSearchParams({ funderAddress: accountAddress })
  const raw = await flashRequest(`/orders/${encodeURIComponent(request.orderId)}?${params}`)
  const record = normalizeOrderRecord(objectPayload(raw).order || raw, fallback)

  updateRecord(record.orderId, record)
  if (isTerminalStatus(record.status)) resolveOrderNotification(record)
  ensureOpenOrderPolling()

  return {
    ...runtime(),
    orderId: request.orderId,
    order: record,
    raw
  }
}

export async function cancelOrder(request: FlashCancelOrderRequest) {
  const defaultCancelMessage = `Definitive Flash v1 — Cancel Order\nOrder: ${request.orderId}`
  const body = {
    cancelMessage:
      typeof request.cancelMessage === 'string' && request.cancelMessage.trim()
        ? request.cancelMessage
        : defaultCancelMessage,
    userSignature: request.userSignature || request.signature
  }
  const raw = await flashRequest(`/orders/${encodeURIComponent(request.orderId)}/cancel`, {
    method: 'POST',
    body: JSON.stringify(body)
  })
  const fallback = getRecord(request.orderId)
  const record = normalizeOrderRecord(
    objectPayload(raw).order || { ...(fallback || {}), orderId: request.orderId, status: 'cancelled' },
    fallback
  )

  updateRecord(record.orderId, record)
  resolveOrderNotification(record)
  stopMarketOrderPolling(request.orderId)
  ensureOpenOrderPolling()

  return {
    ...runtime(),
    orderId: request.orderId,
    cancelled: true,
    order: record,
    raw
  }
}

export default {
  quote,
  submitOrder,
  listOrders,
  getOrder,
  cancelOrder,
  refreshOpenOrders,
  setPositionSync: setFlashPositionSync,
  startOpenOrderPolling,
  stopOpenOrderPolling
}
