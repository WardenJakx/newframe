import { createFlashApi, flashApiKey, flashWebSocketUrl } from '@newframe/flash/api'
import { flashAssetId, getFlashAssetsForChain, toFlashApiAssetAddress } from '@newframe/flash/assets'
import { FLASH_NATIVE_ETH_TOKEN_ADDRESS, FLASH_MARKET_ORDER_TYPE } from '@newframe/flash/constants'
import {
  FlashCancelOrderRequestSchema,
  FlashGetOrderRequestSchema,
  FlashListOrdersRequestSchema,
  FlashSubmitOrderRequestSchema,
  type FlashBoundQuoteRequest,
  type FlashCancelOrderRequest,
  type FlashGetOrderRequest,
  type FlashListOrdersRequest,
  type FlashSubmitOrderRequest
} from '@newframe/flash/contracts'
import { FlashOrderRecordSchema, type FlashOrderRecord, type FlashOrderStatus } from '@newframe/flash/orders'
import { getReceiveAsset, getSpentAsset } from '@newframe/flash/pair'
import { flashChainIdFromSlug } from '@newframe/flash/protocol'
import {
  FlashAssetSchema,
  FlashQuoteSchema,
  type FlashAsset,
  type FlashOrderType,
  type FlashQuote,
  type FlashRuntime,
  type FlashTradeSide
} from '@newframe/flash/schemas'
import {
  flashRawStatus as toRawStatus,
  isFlashOpenStatus,
  isFlashTerminalStatus,
  normalizeFlashStatus as normalizeStatus
} from '@newframe/flash/status'
import {
  FlashOrderStream,
  type FlashOrderFrameType,
  type FlashWebSocketFactory
} from '@newframe/flash/websocket'

import type { AssetRateInput } from '../../../features/asset-data/domain/state/rate.ts'
import type { AssetRateService } from '../../../features/asset-data/main/assetRates/service.ts'
import { NATIVE_CURRENCY } from '../../../features/tokens/domain/constants.ts'
import { getMainRuntime } from '../../../platform/runtime/index.ts'
import type { CanonicalStoreReader } from '../../../platform/state-store/actions.ts'
import type { Token } from '../../../platform/state-store/state/index.ts'
import type { Internet } from '../../internet/index.ts'

const flashApi = (state: FlashServiceState) =>
  createFlashApi({ runtime: runtime(), fetch: state.internet.request })

interface FlashOrderPositionUpdate {
  address: string
  chainId: number
  tokens: Token[]
}

export interface FlashPositionSync {
  refresh: (update: FlashOrderPositionUpdate) => void
  track: (update: FlashOrderPositionUpdate) => void
}

const FLASH_MARKET_ORDER_NOTIFICATION_MS = 60 * 1000
const FLASH_RESOLVED_ORDER_NOTIFICATION_MS = 3 * 1000
const FLASH_MARKET_ORDER_POLL_MS = 3 * 1000
const FLASH_OPEN_ORDER_POLL_MS = 5 * 60 * 1000
const FLASH_STREAM_FALLBACK_POLL_MS = 30 * 1000
const MAX_SESSION_EXPIRATION_TIMER_MS = 24 * 60 * 60 * 1000

interface FlashMarketOrderPoller {
  deadline: number
  timer?: ReturnType<typeof setTimeout>
}

interface FlashAiSessionStream {
  accountAddress: string
  expirationTimer?: ReturnType<typeof setTimeout>
  expiresAt: number
  fallbackTimer?: ReturnType<typeof setTimeout>
  stream: FlashOrderStream
  streaming: boolean
}

type FlashInternet = Pick<Internet, 'isOpen' | 'openWebSocket' | 'request' | 'subscribe'>

interface FlashServiceState {
  aiSessionStreams: Map<string, FlashAiSessionStream>
  createWebSocket: FlashWebSocketFactory
  marketOrderPollers: Map<string, FlashMarketOrderPoller>
  internet: FlashInternet
  openOrderPoller: ReturnType<typeof setInterval> | null
  openOrderRefresh: Promise<FlashOrderRecord[]> | null
  positionSync: FlashPositionSync | null
  store: Pick<CanonicalStoreReader, 'getState'>
}

function createFlashServiceState(
  canonicalStore: Pick<CanonicalStoreReader, 'getState'>,
  internet: FlashInternet,
  positionSync?: FlashPositionSync,
  createWebSocket: FlashWebSocketFactory = (url) => internet.openWebSocket(url)
): FlashServiceState {
  return {
    aiSessionStreams: new Map(),
    createWebSocket,
    marketOrderPollers: new Map(),
    internet,
    openOrderPoller: null,
    openOrderRefresh: null,
    positionSync: positionSync ?? null,
    store: canonicalStore
  }
}

function runtime(): FlashRuntime & {
  environment: string
  profile: string | null
} {
  return getMainRuntime()
}

function normalizeAddress(address?: unknown) {
  return typeof address === 'string' ? address.trim().toLowerCase() : ''
}

function objectPayload(value: unknown): Record<string, unknown | undefined> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown | undefined>)
    : {}
}

function stringValue(value: unknown, fallback = '') {
  if (value === undefined || value === null) {
    return fallback
  }
  if (typeof value === 'string') {
    return value
  }
  if (typeof value === 'number' || typeof value === 'bigint' || typeof value === 'boolean') {
    return String(value)
  }

  return fallback
}

function firstPresent(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null)
}

function numberTimestamp(value: unknown, fallback = Date.now()) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }

  return fallback
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

function isOpenStatus(status: FlashOrderStatus) {
  return isFlashOpenStatus(status)
}

function isTerminalStatus(status: FlashOrderStatus) {
  return isFlashTerminalStatus(status)
}

function orderPositionTokens(record: FlashOrderRecord, chainId?: number) {
  const tokens = new Map<string, Token>()
  const affectedAssets = [record.spentAsset, record.receiveAsset]

  affectedAssets.forEach((asset) => {
    if (chainId !== undefined && asset.chainId !== chainId) {
      return
    }
    const address = (asset.address || '').trim().toLowerCase()
    if (asset.isNative || !/^0x[0-9a-f]{40}$/.test(address)) {
      return
    }

    const token = {
      address,
      chainId: asset.chainId,
      decimals: asset.decimals,
      name: asset.name || asset.symbol,
      symbol: asset.symbol
    }

    tokens.set(`${token.chainId}:${address}`, token)
  })

  return [...tokens.values()]
}

function orderPositionUpdates(record: FlashOrderRecord) {
  return [...new Set([record.spentAsset.chainId, record.receiveAsset.chainId])].map((chainId) => ({
    address: record.accountAddress,
    chainId,
    tokens: orderPositionTokens(record, chainId)
  }))
}

function positionTokenIds(record: FlashOrderRecord) {
  return orderPositionUpdates(record)
    .flatMap((update) => [
      `chain:${update.chainId}`,
      ...update.tokens.map((token) => `${token.chainId}:${token.address}`)
    ])
    .sort()
    .join(',')
}

function shouldTrackOrderPositions(previous: FlashOrderRecord | undefined, record: FlashOrderRecord) {
  return (
    !previous ||
    previous.accountAddress !== record.accountAddress ||
    positionTokenIds(previous) !== positionTokenIds(record)
  )
}

function shouldRefreshOrderPositions(previous: FlashOrderRecord | undefined, record: FlashOrderRecord) {
  if (record.status !== 'partially-filled' && !isTerminalStatus(record.status)) {
    return false
  }
  if (!previous || previous.status !== record.status) {
    return true
  }

  return (
    previous.filledOutputAmount !== record.filledOutputAmount ||
    previous.fillHash !== record.fillHash ||
    previous.fillTransactionHash !== record.fillTransactionHash
  )
}

function syncOrderPositions(
  state: FlashServiceState,
  previous: FlashOrderRecord | undefined,
  record: FlashOrderRecord
) {
  if (!state.positionSync) {
    return
  }

  try {
    for (const update of orderPositionUpdates(record)) {
      if (shouldTrackOrderPositions(previous, record)) {
        state.positionSync.track(update)
      }
      if (shouldRefreshOrderPositions(previous, record)) {
        state.positionSync.refresh(update)
      }
    }
  } catch (error) {
    console.warn('could not sync positions for Flash order', { orderId: record.orderId }, error)
  }
}

function quoteAssetRateInputs(quote: FlashQuote): AssetRateInput[] {
  const legs = [
    {
      amount: quote.inputAmount,
      asset: quote.spentAsset,
      notional: quote.inputNotional
    },
    {
      amount: quote.outputAmount,
      asset: quote.receiveAsset,
      notional: quote.outputNotional
    }
  ]

  return legs.flatMap(({ amount, asset, notional }) => {
    const amountNumber = Number(amount)
    const notionalNumber = Number(notional)
    const usdRate = notionalNumber / amountNumber

    if (
      !Number.isFinite(amountNumber) ||
      amountNumber <= 0 ||
      !Number.isFinite(notionalNumber) ||
      notionalNumber <= 0 ||
      !Number.isFinite(usdRate) ||
      usdRate <= 0
    ) {
      return []
    }

    return [
      {
        chainId: asset.chainId,
        address:
          normalizeAddress(asset.address) === FLASH_NATIVE_ETH_TOKEN_ADDRESS
            ? NATIVE_CURRENCY
            : normalizeAddress(asset.address),
        usdRate
      }
    ]
  })
}

function storeOrders(state: FlashServiceState) {
  return Object.entries(state.store.getState().main.orders).reduce<Record<string, FlashOrderRecord>>(
    (records, [orderId, order]) => {
      const parsed = FlashOrderRecordSchema.safeParse(order)
      if (parsed.success) {
        records[orderId] = parsed.data
      }
      return records
    },
    {}
  )
}

function titleize(value: string) {
  return String(value)
    .replace(/-/g, ' ')
    .split(' ')
    .filter(Boolean)
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(' ')
}

function assetSymbol(asset?: FlashAsset) {
  return asset?.symbol ?? 'asset'
}

function orderNotificationId(orderId: string) {
  return `flash-order:${orderId}`
}

function orderNotificationTitle(record: FlashOrderRecord) {
  const side = titleize(record.side)
  const type = titleize(record.orderType)

  return `${side} ${assetSymbol(record.targetAsset)} ${type} Order`
}

function orderNotificationDetail(record: FlashOrderRecord, status: FlashOrderStatus = record.status) {
  const outputAmount = (record.filledOutputAmount ?? record.outputAmount) || record.estimatedOutputAmount
  const flow = `${record.spentAmount} ${assetSymbol(record.spentAsset)} -> ${outputAmount} ${assetSymbol(
    record.receiveAsset
  )}`

  if (status === 'filled') {
    return `Filled ${flow}`
  }
  if (status === 'cancelled') {
    return `Cancelled ${flow}`
  }
  if (status === 'rejected') {
    return `Rejected ${flow}`
  }
  if (status === 'expired') {
    return `Expired ${flow}`
  }
  if (status === 'terminated') {
    return `Terminated ${flow}`
  }

  return flow
}

function orderNotificationAsset(record: FlashOrderRecord, status: FlashOrderStatus = record.status) {
  return status === 'filled' ? record.receiveAsset : record.spentAsset
}

function orderNotificationTarget(record: FlashOrderRecord, status: FlashOrderStatus = record.status) {
  return {
    type: 'flashOrder',
    orderId: record.orderId,
    account: record.accountAddress,
    chainId: orderNotificationAsset(record, status).chainId,
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

function upsertPendingOrderNotification(
  state: FlashServiceState,
  record: FlashOrderRecord,
  now = Date.now()
) {
  const createdAt = record.createdAt || now

  state.store.getState().upsertPendingNotification({
    id: orderNotificationId(record.orderId),
    state: 'pending',
    title: orderNotificationTitle(record),
    detail: orderNotificationDetail(record),
    createdAt,
    updatedAt: now,
    expiresAt: now + FLASH_MARKET_ORDER_NOTIFICATION_MS,
    leadingIcon: {
      chainType: 'ethereum',
      chainId: orderNotificationAsset(record).chainId
    },
    target: orderNotificationTarget(record),
    metadata: orderNotificationMetadata(record)
  })
}

function terminalOrderNotificationState(record: FlashOrderRecord) {
  return record.status === 'filled' ? 'completed' : 'failed'
}

function resolveOrderNotification(state: FlashServiceState, record: FlashOrderRecord, now = Date.now()) {
  if (!isTerminalStatus(record.status)) {
    return
  }

  state.store
    .getState()
    .resolveNotification(orderNotificationId(record.orderId), terminalOrderNotificationState(record), {
      title: orderNotificationTitle(record),
      detail: orderNotificationDetail(record, record.status),
      expiresAt: now + FLASH_RESOLVED_ORDER_NOTIFICATION_MS,
      updatedAt: now,
      leadingIcon: {
        chainType: 'ethereum',
        chainId: orderNotificationAsset(record, record.status).chainId
      },
      target: orderNotificationTarget(record, record.status),
      metadata: orderNotificationMetadata(record)
    })
}

function dropOrderNotification(state: FlashServiceState, orderId: string) {
  state.store.getState().expireNotification(orderNotificationId(orderId))
}

function orderAssetFromReference(value: unknown, fallback?: FlashAsset | null): FlashAsset | null {
  const asset = objectPayload(value)

  if (
    typeof asset.id === 'string' &&
    typeof asset.symbol === 'string' &&
    Number.isInteger(Number(asset.chainId)) &&
    Number.isInteger(Number(asset.decimals))
  ) {
    const parsed = FlashAssetSchema.safeParse(asset)
    if (parsed.success) {
      return parsed.data
    }
  }

  const chain = objectPayload(asset.chain)
  const chainId =
    flashChainIdFromSlug(asset.chainId) ??
    flashChainIdFromSlug(chain.id) ??
    flashChainIdFromSlug(chain.name) ??
    fallback?.chainId
  const address = stringValue(asset.address ?? fallback?.address).trim()

  if (!chainId || !address) {
    return fallback ?? null
  }

  const normalizedAddress = normalizeAddress(address)
  const fallbackMatches =
    fallback?.chainId === chainId && normalizeAddress(toFlashApiAssetAddress(fallback)) === normalizedAddress
      ? fallback
      : null
  const knownAsset = getFlashAssetsForChain(chainId).find(
    (candidate) => normalizeAddress(toFlashApiAssetAddress(candidate)) === normalizedAddress
  )
  const metadata = fallbackMatches ?? knownAsset
  const decimals = Number(asset.decimals)
  const isNative = normalizedAddress === normalizeAddress(FLASH_NATIVE_ETH_TOKEN_ADDRESS)

  return FlashAssetSchema.parse({
    id: metadata?.id ?? flashAssetId(chainId, address),
    symbol: stringValue(asset.ticker ?? asset.symbol ?? metadata?.symbol, 'ASSET'),
    name: stringValue(asset.name ?? metadata?.name ?? asset.ticker ?? asset.symbol, 'Unknown asset'),
    decimals: Number.isInteger(decimals) && decimals >= 0 ? decimals : (metadata?.decimals ?? 18),
    chainId,
    isNative,
    address
  })
}

function rawOrderQuote(raw: Record<string, unknown>) {
  return objectPayload(raw.quote ?? raw.flashQuote ?? raw.quotePayload)
}

function quoteTargetNotional(quote: FlashQuote) {
  return stringValue(
    quote.side === 'buy'
      ? (quote.outputNotional ?? quote.to?.notional)
      : (quote.inputNotional ?? quote.from?.notional)
  )
}

function quoteContraNotional(quote: FlashQuote) {
  return stringValue(
    quote.side === 'buy'
      ? (quote.inputNotional ?? quote.from?.notional)
      : (quote.outputNotional ?? quote.to?.notional)
  )
}

function fallbackQuoteFromRecord(record?: FlashOrderRecord | null): FlashQuote | null {
  if (!record) {
    return null
  }

  return FlashQuoteSchema.parse({
    id: record.quoteId,
    side: record.side,
    orderType: record.orderType,
    targetAsset: record.targetAsset,
    contraAsset: record.contraAsset,
    spentAsset: record.spentAsset,
    receiveAsset: record.receiveAsset,
    inputAmount: record.spentAmount,
    outputAmount: record.estimatedOutputAmount || record.outputAmount,
    inputNotional: record.side === 'buy' ? record.contraNotional : record.targetNotional,
    outputNotional: record.side === 'buy' ? record.targetNotional : record.contraNotional,
    rate: record.rate,
    fees: [],
    steps: [],
    raw: record.rawPayload
  })
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

  return FlashOrderRecordSchema.parse({
    orderId,
    accountAddress: normalizeAddress(request.accountAddress),
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
    qty: quote.side === 'buy' ? quote.outputAmount : quote.inputAmount,
    spentAsset: quote.spentAsset,
    spentAmount: quote.inputAmount,
    outputAmount: quote.outputAmount,
    estimatedOutputAmount: quote.outputAmount,
    targetNotional: quoteTargetNotional(quote),
    contraNotional: quoteContraNotional(quote),
    filledOutputAmount: null,
    averageFillPrice: null,
    createdAt: now,
    updatedAt: now,
    terminalAt: isTerminalStatus(status) ? now : null,
    open,
    cancellable: open,
    quoteId: request.quoteId ?? quote.id,
    receiveAsset: quote.receiveAsset,
    rate: quote.rate,
    rawPayload: {
      ...objectPayload(request.rawPayload),
      quote,
      signature: request.orderSignature ?? request.signature ?? null,
      response: raw ?? null
    },
    rawStatusPayload: statusPayload(orderId, status, raw),
    fillHash: null,
    fillTransactionHash: null
  })
}

function normalizeOrderRecord(rawOrder: unknown, fallback?: FlashOrderRecord | null) {
  const raw = objectPayload(rawOrder)
  const orderId = stringValue(raw.orderId ?? raw.id ?? fallback?.orderId)
  if (!orderId) {
    throw new Error('Flash order response did not include an order id')
  }

  const now = Date.now()
  const status = normalizeStatus(raw.normalizedStatus ?? raw.status ?? fallback?.status)
  const quote = rawOrderQuote(raw)
  const fallbackQuote = fallbackQuoteFromRecord(fallback)
  const quotedTargetAsset = objectPayload(quote.targetAsset).id ? (quote.targetAsset as FlashAsset) : null
  const quotedContraAsset = objectPayload(quote.contraAsset).id ? (quote.contraAsset as FlashAsset) : null
  const targetAsset = orderAssetFromReference(raw.targetAsset, quotedTargetAsset ?? fallback?.targetAsset)
  const contraAsset = orderAssetFromReference(raw.contraAsset, quotedContraAsset ?? fallback?.contraAsset)
  const side = (quote.side ?? raw.side ?? fallback?.side ?? 'sell') as FlashTradeSide
  const orderType = (quote.orderType ??
    raw.orderType ??
    fallback?.orderType ??
    FLASH_MARKET_ORDER_TYPE) as FlashOrderType

  if (!targetAsset || !contraAsset) {
    if (fallback) {
      return {
        ...fallback,
        status,
        rawStatus: stringValue(raw.status, toRawStatus(status)),
        updatedAt: numberTimestamp(raw.updatedAt ?? raw.updated_at, now),
        terminalAt: isTerminalStatus(status) ? (fallback.terminalAt ?? now) : null,
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
          raw.fillHash ?? raw.fillTransactionHash ?? raw.transactionHash ?? fallback.fillHash
        ),
        fillTransactionHash: stringValue(
          raw.fillTransactionHash ?? raw.fillHash ?? raw.transactionHash ?? fallback.fillTransactionHash
        )
      }
    }

    throw new Error(`Flash order ${orderId} is missing asset metadata`)
  }

  const derivedSpentAsset = getSpentAsset({ side, targetAsset, contraAsset })
  const derivedReceiveAsset = getReceiveAsset({
    side,
    targetAsset,
    contraAsset
  })
  const spentAsset =
    orderAssetFromReference(raw.spentAsset ?? quote.spentAsset, fallback?.spentAsset ?? derivedSpentAsset) ??
    derivedSpentAsset
  const receiveAsset =
    orderAssetFromReference(
      raw.receiveAsset ?? quote.receiveAsset,
      fallback?.receiveAsset ?? derivedReceiveAsset
    ) ?? derivedReceiveAsset

  const filled = objectPayload(raw.filled)
  const officialFilledOutputAmount = stringValue(side === 'buy' ? filled.targetAmount : filled.contraAmount)
  const officialAverageFillPrice = stringValue(filled.averageNotionalPrice ?? filled.averagePrice)
  const quoteBase =
    fallbackQuote ??
    ({
      id: stringValue(quote.quoteId ?? quote.id ?? raw.quoteId),
      side,
      orderType,
      targetAsset,
      contraAsset,
      spentAsset,
      receiveAsset,
      inputAmount: stringValue(
        quote.inputAmount ?? quote.qty ?? raw.spentAmount ?? raw.inputAmount ?? raw.qty,
        '0'
      ),
      outputAmount: stringValue(
        quote.outputAmount ??
          quote.estimatedOutputAmount ??
          raw.outputAmount ??
          raw.estimatedOutputAmount ??
          officialFilledOutputAmount,
        '0'
      ),
      rate: stringValue(quote.rate ?? raw.rate ?? officialAverageFillPrice),
      fees: [],
      steps: [],
      raw: quote
    } satisfies FlashQuote)
  const quoteLike: FlashQuote = {
    ...quoteBase,
    side,
    orderType,
    targetAsset,
    contraAsset,
    spentAsset,
    receiveAsset
  }
  const open = isOpenStatus(status)
  const filledOutputAmount = stringValue(
    firstPresent(
      raw.filledOutputAmount,
      raw.filledAmount,
      officialFilledOutputAmount,
      fallback?.filledOutputAmount
    )
  )
  const fillHash = stringValue(
    raw.fillHash ?? raw.fillTransactionHash ?? raw.transactionHash ?? fallback?.fillHash
  )
  const createdAt = numberTimestamp(
    raw.createdAt ?? raw.created_at ?? raw.placedAt,
    fallback?.createdAt ?? now
  )
  const updatedAt = numberTimestamp(
    raw.updatedAt ?? raw.updated_at ?? raw.closedAt ?? raw.acceptedAt ?? raw.placedAt,
    now
  )
  const closedAt = raw.closedAt ? numberTimestamp(raw.closedAt, updatedAt) : null

  return FlashOrderRecordSchema.parse({
    ...fallback,
    orderId,
    accountAddress: normalizeAddress(
      stringValue(raw.accountAddress ?? raw.funderAddress ?? raw.account ?? fallback?.accountAddress)
    ),
    provider: 'flash',
    source: 'flash',
    environment: fallback?.environment ?? runtime().environment,
    profile: fallback?.profile ?? runtime().profile,
    status,
    rawStatus: stringValue(raw.status, toRawStatus(status)),
    orderType,
    side,
    targetAsset: quoteLike.targetAsset,
    contraAsset: quoteLike.contraAsset,
    qty: stringValue(
      raw.qty ?? fallback?.qty ?? (side === 'buy' ? quoteLike.outputAmount : quoteLike.inputAmount)
    ),
    spentAsset: quoteLike.spentAsset,
    spentAmount: stringValue(
      raw.spentAmount ?? raw.inputAmount ?? (side === 'sell' ? raw.qty : undefined) ?? quoteLike.inputAmount
    ),
    outputAmount: stringValue(raw.outputAmount ?? quoteLike.outputAmount),
    estimatedOutputAmount: stringValue(raw.estimatedOutputAmount ?? quoteLike.outputAmount),
    targetNotional:
      stringValue(
        firstPresent(
          raw.targetNotional,
          raw.targetNotionalAmount,
          quoteTargetNotional(quoteLike),
          fallback?.targetNotional
        )
      ) || undefined,
    contraNotional:
      stringValue(
        firstPresent(
          raw.contraNotional,
          raw.contraNotionalAmount,
          quoteContraNotional(quoteLike),
          fallback?.contraNotional
        )
      ) || undefined,
    filledOutputAmount: filledOutputAmount || null,
    averageFillPrice:
      stringValue(firstPresent(raw.averageFillPrice, officialAverageFillPrice, fallback?.averageFillPrice)) ||
      null,
    createdAt,
    updatedAt,
    terminalAt: isTerminalStatus(status) ? (closedAt ?? fallback?.terminalAt ?? updatedAt) : null,
    open,
    cancellable: Boolean(raw.cancellable ?? (open && orderType !== FLASH_MARKET_ORDER_TYPE)),
    quoteId: stringValue(raw.quoteId ?? quoteLike.id ?? fallback?.quoteId),
    receiveAsset: quoteLike.receiveAsset,
    rate: stringValue(raw.rate ?? quoteLike.rate ?? fallback?.rate),
    rawPayload: {
      ...objectPayload(fallback?.rawPayload),
      quote: quoteLike,
      response: raw
    },
    rawStatusPayload: statusPayload(orderId, status, raw),
    fillHash: fillHash || null,
    fillTransactionHash: fillHash || null
  })
}

function upsertRecord(state: FlashServiceState, record: FlashOrderRecord) {
  record = FlashOrderRecordSchema.parse(record)
  const previous = getRecord(state, record.orderId)
  state.store.getState().upsertOrder(record)
  syncOrderPositions(state, previous, record)
  return record
}

function getRecord(state: FlashServiceState, orderId: string) {
  return (storeOrders(state) as Record<string, FlashOrderRecord | undefined>)[orderId]
}

function orderEventChanged(previous: FlashOrderRecord | undefined, record: FlashOrderRecord) {
  return (
    !previous ||
    previous.status !== record.status ||
    previous.filledOutputAmount !== record.filledOutputAmount ||
    previous.averageFillPrice !== record.averageFillPrice ||
    previous.fillHash !== record.fillHash ||
    previous.fillTransactionHash !== record.fillTransactionHash
  )
}

function hydrateOrderNotification(
  state: FlashServiceState,
  previous: FlashOrderRecord | undefined,
  record: FlashOrderRecord
) {
  if (!orderEventChanged(previous, record)) {
    return
  }

  const now = Date.now()
  upsertPendingOrderNotification(state, record, now)
  if (isTerminalStatus(record.status)) {
    resolveOrderNotification(state, record, now)
  }
}

function hasStreamingSessionForFunder(state: FlashServiceState, accountAddress: string) {
  const address = normalizeAddress(accountAddress)

  return Array.from(state.aiSessionStreams.values()).some(
    (session) => session.streaming && session.accountAddress === address
  )
}

function applyOrderRecord(state: FlashServiceState, record: FlashOrderRecord) {
  const previous = getRecord(state, record.orderId)
  const storedRecord = upsertRecord(state, record)

  hydrateOrderNotification(state, previous, storedRecord)

  if (isTerminalStatus(storedRecord.status)) {
    stopMarketOrderPolling(state, storedRecord.orderId)
  } else if (storedRecord.orderType === FLASH_MARKET_ORDER_TYPE) {
    startMarketOrderPolling(state, storedRecord)
  }

  ensureOpenOrderPolling(state)
  return storedRecord
}

function hasOrdersRequiringPolling(state: FlashServiceState) {
  return Object.values(storeOrders(state)).some(
    (order) => isOpenStatus(order.status) && !hasStreamingSessionForFunder(state, order.accountAddress)
  )
}

function stopMarketOrderPolling(state: FlashServiceState, orderId: string) {
  const poller = state.marketOrderPollers.get(orderId)
  if (poller?.timer) {
    clearTimeout(poller.timer)
  }
  state.marketOrderPollers.delete(orderId)
}

function scheduleMarketOrderPoll(state: FlashServiceState, orderId: string, poller: FlashMarketOrderPoller) {
  if (!state.marketOrderPollers.has(orderId)) {
    return
  }

  poller.timer = setTimeout(() => {
    void pollMarketOrder(state, orderId, poller)
  }, FLASH_MARKET_ORDER_POLL_MS)
}

async function pollMarketOrder(state: FlashServiceState, orderId: string, poller: FlashMarketOrderPoller) {
  const current = getRecord(state, orderId)

  if (!current) {
    dropOrderNotification(state, orderId)
    stopMarketOrderPolling(state, orderId)
    ensureOpenOrderPolling(state)
    return
  }

  if (current.orderType !== FLASH_MARKET_ORDER_TYPE) {
    stopMarketOrderPolling(state, orderId)
    ensureOpenOrderPolling(state)
    return
  }

  if (hasStreamingSessionForFunder(state, current.accountAddress)) {
    stopMarketOrderPolling(state, orderId)
    ensureOpenOrderPolling(state)
    return
  }

  if (isTerminalStatus(current.status)) {
    stopMarketOrderPolling(state, orderId)
    ensureOpenOrderPolling(state)
    return
  }

  if (Date.now() >= poller.deadline) {
    dropOrderNotification(state, orderId)
    stopMarketOrderPolling(state, orderId)
    ensureOpenOrderPolling(state)
    return
  }

  let latest = current

  try {
    latest = await fetchOrderRecord(state, current)
  } catch (error) {
    console.error('error polling Flash market order', error)
  }

  if (isTerminalStatus(latest.status)) {
    stopMarketOrderPolling(state, orderId)
    ensureOpenOrderPolling(state)
    return
  }

  upsertPendingOrderNotification(state, latest)
  scheduleMarketOrderPoll(state, orderId, poller)
}

function startMarketOrderPolling(state: FlashServiceState, record: FlashOrderRecord) {
  if (!state.internet.isOpen() || record.orderType !== FLASH_MARKET_ORDER_TYPE) {
    return
  }
  if (hasStreamingSessionForFunder(state, record.accountAddress)) {
    return
  }

  const now = Date.now()

  if (isTerminalStatus(record.status)) {
    return
  }

  if (state.marketOrderPollers.has(record.orderId)) {
    return
  }

  const poller = {
    deadline: (record.createdAt || now) + FLASH_MARKET_ORDER_NOTIFICATION_MS
  }

  state.marketOrderPollers.set(record.orderId, poller)
  void pollMarketOrder(state, record.orderId, poller)
}

function stopOpenOrderPolling(state: FlashServiceState) {
  if (!state.openOrderPoller) {
    return
  }

  clearInterval(state.openOrderPoller)
  state.openOrderPoller = null
}

function ensureOpenOrderPolling(state: FlashServiceState) {
  if (!state.internet.isOpen() || !hasOrdersRequiringPolling(state)) {
    stopOpenOrderPolling(state)
    return
  }

  if (state.openOrderPoller) {
    return
  }

  state.openOrderPoller = setInterval(() => {
    void refreshOpenOrders(state)
      .catch((error: unknown) => {
        console.error('error refreshing Flash open orders', error)
      })
      .finally(() => {
        ensureOpenOrderPolling(state)
      })
  }, FLASH_OPEN_ORDER_POLL_MS)
}

function sortOrders(a: FlashOrderRecord, b: FlashOrderRecord) {
  if (a.open !== b.open) {
    return a.open ? -1 : 1
  }

  return Number(b.createdAt || 0) - Number(a.createdAt || 0)
}

async function fetchOrderRecord(state: FlashServiceState, fallback: FlashOrderRecord) {
  const raw = await flashApi(state).getOrder(fallback.accountAddress, fallback.orderId)
  const record = normalizeOrderRecord(raw.order, fallback)

  return applyOrderRecord(state, record)
}

function refreshOpenOrders(state: FlashServiceState) {
  if (state.openOrderRefresh) {
    return state.openOrderRefresh
  }

  const openOrders = Object.values(storeOrders(state)).filter(
    (order) => isOpenStatus(order.status) && !hasStreamingSessionForFunder(state, order.accountAddress)
  )

  state.openOrderRefresh = Promise.all(
    openOrders.map(async (order) => {
      try {
        return await fetchOrderRecord(state, order)
      } catch (error) {
        console.error('error refreshing Flash open order', error)
        return order
      }
    })
  ).finally(() => {
    state.openOrderRefresh = null
  })

  return state.openOrderRefresh
}

async function applyWebSocketOrders(
  state: FlashServiceState,
  accountAddress: string,
  type: FlashOrderFrameType,
  rawOrders: unknown[]
) {
  const address = normalizeAddress(accountAddress)
  const receivedOrderIds = new Set<string>()

  for (const rawOrder of rawOrders) {
    try {
      const raw = objectPayload(rawOrder)
      const orderId = stringValue(raw.orderId ?? raw.id)
      if (orderId) {
        receivedOrderIds.add(orderId)
      }

      const record = normalizeOrderRecord(rawOrder, orderId ? getRecord(state, orderId) : null)
      if (record.accountAddress !== address) {
        continue
      }
      applyOrderRecord(state, record)
    } catch (error) {
      console.warn('could not apply Flash WebSocket order update', error)
    }
  }

  if (type !== 'snapshot') {
    return
  }

  const missingOpenOrders = Object.values(storeOrders(state)).filter(
    (order) =>
      order.accountAddress === address && isOpenStatus(order.status) && !receivedOrderIds.has(order.orderId)
  )

  await Promise.all(
    missingOpenOrders.map(async (order) => {
      try {
        await fetchOrderRecord(state, order)
      } catch (error) {
        console.warn('could not reconcile Flash order missing from WebSocket snapshot', error)
      }
    })
  )
}

function stopAiSessionFallback(session: FlashAiSessionStream) {
  if (session.fallbackTimer) {
    clearTimeout(session.fallbackTimer)
  }
  session.fallbackTimer = undefined
}

function scheduleAiSessionFallback(
  state: FlashServiceState,
  sessionId: string,
  delay = FLASH_STREAM_FALLBACK_POLL_MS
) {
  const session = state.aiSessionStreams.get(sessionId)
  if (
    !state.internet.isOpen() ||
    !session ||
    session.streaming ||
    hasStreamingSessionForFunder(state, session.accountAddress)
  ) {
    return
  }

  stopAiSessionFallback(session)
  session.fallbackTimer = setTimeout(() => {
    session.fallbackTimer = undefined
    const current = state.aiSessionStreams.get(sessionId)
    if (!current || current.streaming || hasStreamingSessionForFunder(state, current.accountAddress)) {
      return
    }

    void listOrders(state, {
      accountAddress: current.accountAddress,
      pageSize: 200,
      status: ['pending', 'accepted', 'partially-filled']
    })
      .catch((error: unknown) =>
        console.warn('could not poll Flash orders while WebSocket was unavailable', error)
      )
      .finally(() => scheduleAiSessionFallback(state, sessionId))
  }, delay)
}

function setAiSessionStreaming(state: FlashServiceState, sessionId: string, streaming: boolean) {
  const session = state.aiSessionStreams.get(sessionId)
  if (!session || session.streaming === streaming) {
    return
  }

  session.streaming = streaming
  if (streaming) {
    stopAiSessionFallback(session)
    for (const [orderId] of state.marketOrderPollers) {
      const order = getRecord(state, orderId)
      if (order?.accountAddress === session.accountAddress) {
        stopMarketOrderPolling(state, orderId)
      }
    }
  } else {
    scheduleAiSessionFallback(state, sessionId, 0)
    Object.values(storeOrders(state))
      .filter((order) => order.accountAddress === session.accountAddress)
      .forEach((order) => startMarketOrderPolling(state, order))
  }

  ensureOpenOrderPolling(state)
}

function stopAiSessionStream(state: FlashServiceState, sessionId: string) {
  const session = state.aiSessionStreams.get(sessionId)
  if (!session) {
    return false
  }

  state.aiSessionStreams.delete(sessionId)
  if (session.expirationTimer) {
    clearTimeout(session.expirationTimer)
  }
  stopAiSessionFallback(session)
  session.stream.stop()

  Object.values(storeOrders(state))
    .filter((order) => order.accountAddress === session.accountAddress)
    .forEach((order) => startMarketOrderPolling(state, order))
  ensureOpenOrderPolling(state)
  return true
}

function scheduleAiSessionExpiration(state: FlashServiceState, sessionId: string) {
  const session = state.aiSessionStreams.get(sessionId)
  if (!session) {
    return
  }

  if (session.expirationTimer) {
    clearTimeout(session.expirationTimer)
  }
  const remaining = session.expiresAt - Date.now()
  if (remaining <= 0) {
    stopAiSessionStream(state, sessionId)
    return
  }

  session.expirationTimer = setTimeout(
    () => scheduleAiSessionExpiration(state, sessionId),
    Math.min(remaining, MAX_SESSION_EXPIRATION_TIMER_MS)
  )
}

function startAiSessionStream(
  state: FlashServiceState,
  { accountAddress, expiresAt, sessionId }: { accountAddress: string; expiresAt: number; sessionId: string }
) {
  stopAiSessionStream(state, sessionId)

  const address = normalizeAddress(accountAddress)
  if (!sessionId || !/^0x[0-9a-f]{40}$/.test(address) || expiresAt <= Date.now()) {
    return false
  }

  const stream = new FlashOrderStream({
    apiKey: flashApiKey(),
    createSocket: state.createWebSocket,
    funderAddress: address,
    url: flashWebSocketUrl(runtime()),
    onAvailabilityChange: (available) => setAiSessionStreaming(state, sessionId, available),
    onError: (error) => console.warn('Flash WebSocket error', { sessionId, accountAddress: address }, error),
    onTerminalError: () => {
      const current = state.aiSessionStreams.get(sessionId)
      if (current) {
        stopAiSessionFallback(current)
      }
    },
    onOrders: (type, orders) => applyWebSocketOrders(state, address, type, orders)
  })
  const session: FlashAiSessionStream = {
    accountAddress: address,
    expiresAt,
    stream,
    streaming: false
  }

  state.aiSessionStreams.set(sessionId, session)
  scheduleAiSessionExpiration(state, sessionId)
  if (state.internet.isOpen()) {
    scheduleAiSessionFallback(state, sessionId)
    stream.start()
  }
  return true
}

function pauseFlashInternet(state: FlashServiceState) {
  stopOpenOrderPolling(state)
  for (const orderId of state.marketOrderPollers.keys()) {
    stopMarketOrderPolling(state, orderId)
  }
  for (const session of state.aiSessionStreams.values()) {
    stopAiSessionFallback(session)
    session.stream.stop()
  }
}

function resumeFlashInternet(state: FlashServiceState) {
  for (const [sessionId, session] of state.aiSessionStreams) {
    scheduleAiSessionFallback(state, sessionId)
    session.stream.start()
  }
  Object.values(storeOrders(state)).forEach((order) => startMarketOrderPolling(state, order))
  ensureOpenOrderPolling(state)
}

function stopAiSessionStreamsForAccount(state: FlashServiceState, accountAddress: string) {
  const address = normalizeAddress(accountAddress)
  const sessionIds = Array.from(state.aiSessionStreams.entries())
    .filter(([, session]) => session.accountAddress === address)
    .map(([sessionId]) => sessionId)

  sessionIds.forEach((sessionId) => stopAiSessionStream(state, sessionId))
  return sessionIds.length
}

async function quote(state: FlashServiceState, request: FlashBoundQuoteRequest) {
  const { quote: normalizedQuote, flash } = await flashApi(state).quote(request)

  return {
    ...runtime(),
    quote: normalizedQuote,
    flash
  }
}

async function submitOrder(state: FlashServiceState, request: FlashSubmitOrderRequest) {
  request = FlashSubmitOrderRequestSchema.parse(request)
  const raw = await flashApi(state).submitOrder(request)
  const orderId = raw.orderId

  const fallback = recordFromQuote({
    orderId,
    quote: request.quote,
    raw,
    request,
    status: normalizeStatus(raw.status ?? raw.order?.status)
  })
  const record = normalizeOrderRecord(raw.order ?? raw, fallback)
  const storedRecord = applyOrderRecord(state, record)

  return {
    ...runtime(),
    orderId,
    order: storedRecord,
    raw
  }
}

async function listOrders(state: FlashServiceState, request: FlashListOrdersRequest = {}) {
  request = FlashListOrdersRequestSchema.parse(request)
  const accountAddress = request.accountAddress?.trim()

  if (!accountAddress) {
    throw new Error('Flash order list requires an account address')
  }

  const raw = await flashApi(state).listOrders(accountAddress, {
    status: request.status,
    pageSize: request.pageSize
  })
  const orders = raw.orders
    .map((order) => {
      const orderId = stringValue(objectPayload(order).orderId ?? objectPayload(order).id)
      const fallback = orderId ? getRecord(state, orderId) : null
      const record = normalizeOrderRecord(order, fallback)
      return applyOrderRecord(state, record)
    })
    .sort(sortOrders)

  ensureOpenOrderPolling(state)

  return {
    ...runtime(),
    orders,
    count: orders.length
  }
}

async function getOrder(state: FlashServiceState, request: FlashGetOrderRequest) {
  request = FlashGetOrderRequestSchema.parse(request)
  const fallback = getRecord(state, request.orderId)
  const requestedAddress = (request as { accountAddress?: string }).accountAddress
  const accountAddress = requestedAddress?.trim() ?? fallback?.accountAddress

  if (!accountAddress) {
    throw new Error('Flash order lookup requires an account address')
  }

  const raw = await flashApi(state).getOrder(accountAddress, request.orderId)
  const record = normalizeOrderRecord(raw.order, fallback)
  const storedRecord = applyOrderRecord(state, record)

  return {
    ...runtime(),
    orderId: request.orderId,
    order: storedRecord,
    raw
  }
}

async function cancelOrder(state: FlashServiceState, request: FlashCancelOrderRequest) {
  request = FlashCancelOrderRequestSchema.parse(request)
  const signature = request.userSignature ?? request.signature ?? ''
  const message = request.cancelMessage?.trim() ? request.cancelMessage : undefined
  const raw = message
    ? await flashApi(state).cancelOrder(request.orderId, signature, message)
    : await flashApi(state).cancelOrder(request.orderId, signature)
  const fallback = getRecord(state, request.orderId)
  const record = normalizeOrderRecord(
    raw.order ?? {
      ...fallback,
      orderId: request.orderId,
      status: 'cancelled'
    },
    fallback
  )

  const storedRecord = applyOrderRecord(state, record)

  return {
    ...runtime(),
    orderId: request.orderId,
    cancelled: true,
    order: storedRecord,
    raw
  }
}

export function createFlashService({
  assetRateService,
  createWebSocket,
  internet,
  positionSync,
  store
}: {
  assetRateService: Pick<AssetRateService, 'observe'>
  createWebSocket?: FlashWebSocketFactory
  internet: FlashInternet
  positionSync?: FlashPositionSync
  store: Pick<CanonicalStoreReader, 'getState'>
}) {
  const state = createFlashServiceState(store, internet, positionSync, createWebSocket)
  const unsubscribeInternet = internet.subscribe((open) =>
    open ? resumeFlashInternet(state) : pauseFlashInternet(state)
  )

  return {
    quote: async (request: FlashBoundQuoteRequest) => {
      const result = await quote(state, request)
      const observations = quoteAssetRateInputs(result.quote)

      if (observations.length) {
        try {
          assetRateService.observe('flash', observations)
        } catch {
          // Rate observations are best-effort and must never change a successful quote response.
        }
      }

      return result
    },
    submitOrder: (request: FlashSubmitOrderRequest) => submitOrder(state, request),
    listOrders: (request: FlashListOrdersRequest = {}) => listOrders(state, request),
    getOrder: (request: FlashGetOrderRequest) => getOrder(state, request),
    cancelOrder: (request: FlashCancelOrderRequest) => cancelOrder(state, request),
    refreshOpenOrders: () => refreshOpenOrders(state),
    startOpenOrderPolling: () => ensureOpenOrderPolling(state),
    startAiSession: (session: { accountAddress: string; expiresAt: number; sessionId: string }) =>
      startAiSessionStream(state, session),
    stopAiSession: (sessionId: string) => stopAiSessionStream(state, sessionId),
    stopAiSessionsForAccount: (accountAddress: string) =>
      stopAiSessionStreamsForAccount(state, accountAddress),
    dispose: () => {
      unsubscribeInternet()
      for (const sessionId of state.aiSessionStreams.keys()) {
        stopAiSessionStream(state, sessionId)
      }
      stopOpenOrderPolling(state)
      for (const orderId of state.marketOrderPollers.keys()) {
        stopMarketOrderPolling(state, orderId)
      }
    }
  }
}

export type FlashService = ReturnType<typeof createFlashService>
