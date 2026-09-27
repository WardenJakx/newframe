import { z } from 'zod'

import { getFlashAssetsForChain, toFlashApiAssetAddress } from './assets.js'
import { getFlashChainIdFromSlug, getFlashChainSlug, isFlashChainSupported } from './chains.js'
import { FLASH_MARKET_ORDER_TYPE } from './constants.js'
import {
  FlashBoundQuoteRequestSchema,
  FlashSubmitOrderRequestSchema,
  type FlashBoundQuoteRequest,
  type FlashPriceTriggerInput,
  type FlashQuoteRequest,
  type FlashSubmitOrderRequest
} from './contracts.js'
import { getFlashAssetPairChains, getReceiveAsset, getSpentAsset } from './pair.js'
import { flashRuntimeFromEnv } from './runtime.js'
import {
  FlashQuoteSchema,
  FlashRuntimeSchema,
  type FlashAsset,
  type FlashOrderType,
  type FlashQuote,
  type FlashQuoteAction,
  type FlashQuoteFee,
  type FlashQuoteTransactionRequest,
  type FlashRuntime,
  type FlashStep
} from './schemas.js'
import { FlashQuoteResponseSchema } from './wire.js'

function normalizeAddress(address?: unknown) {
  return typeof address === 'string' ? address.trim().toLowerCase() : ''
}

function normalizeAmount(amount?: string | number) {
  return String(amount ?? '')
    .trim()
    .replace(/,/g, '')
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

export function flashChainIdFromSlug(input: unknown) {
  if (typeof input === 'number') {
    return input
  }
  if (typeof input !== 'string') {
    return undefined
  }

  const normalized = input.trim().toLowerCase()
  const registeredChainId = getFlashChainIdFromSlug(normalized)
  if (registeredChainId) {
    return registeredChainId
  }

  const parsed = Number(normalized)
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed
  }

  const caipChainId = normalized.match(/(?:^|:)(\d+)$/)?.[1]
  const caipParsed = Number(caipChainId)

  return Number.isInteger(caipParsed) && caipParsed > 0 ? caipParsed : undefined
}

function requireSupportedChainId(chainId: number, runtime: FlashRuntime) {
  if (!isFlashChainSupported(chainId, runtime)) {
    throw new Error(`Flash does not support chain ${chainId} for this runtime`)
  }

  return chainId
}

function normalizePercent(value?: string | number) {
  if (value === undefined || String(value).trim() === '') {
    return undefined
  }

  const parsed = Number(normalizeAmount(value))

  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined
  }

  return (parsed / 100).toString()
}

function optionalString(value: unknown) {
  const clean = normalizeAmount(value as string | number)

  return clean || undefined
}

function optionalInteger(value: unknown, label: string, { max, min }: { max?: number; min?: number } = {}) {
  if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
    return undefined
  }

  const parsed =
    typeof value === 'string' || typeof value === 'number' ? Number(normalizeAmount(value)) : Number.NaN
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
    if (request.triggers.length > 2) {
      throw new Error('Flash supports at most two price triggers')
    }

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
        notionalPrice: stopLossNotionalPrice ?? triggerNotionalPrice ?? '',
        triggerType: 'lower' as const
      }
    ]
  }
  if (orderType === 'take-profit' && (takeProfitNotionalPrice || triggerNotionalPrice)) {
    return [
      {
        notionalPrice: takeProfitNotionalPrice ?? triggerNotionalPrice ?? '',
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

export function buildFlashQuoteBodyValidated(request: FlashBoundQuoteRequest, runtime: FlashRuntime) {
  const targetAsset = request.targetAsset
  const contraAsset = request.contraAsset
  const side = request.side
  const chains = getFlashAssetPairChains({ side, targetAsset, contraAsset })
  requireSupportedChainId(chains.targetChainId, runtime)
  requireSupportedChainId(chains.contraChainId, runtime)
  const qty = normalizeAmount(request.qty ?? request.inputAmount)
  const orderType = request.orderType ?? FLASH_MARKET_ORDER_TYPE
  const maxSlippage = normalizePercent(request.slippage)
  const maxPriceImpact = normalizePercent(request.maxPriceImpact)
  const durationSeconds =
    orderType === 'twap'
      ? optionalInteger(request.durationSeconds, 'durationSeconds', {
          min: 300
        })
      : undefined
  const twapBucketCount =
    orderType === 'twap'
      ? optionalInteger(request.twapBucketCount, 'twapBucketCount', {
          min: 2,
          max: 2560
        })
      : undefined
  const isTriggerOrder = ['stop', 'stop-loss', 'take-profit', 'bracket'].includes(orderType)
  const triggers = isTriggerOrder ? normalizeTriggers(request, orderType) : undefined
  const supportsExpiry = orderType === 'limit' || isTriggerOrder
  const supportsLimitPrice =
    orderType === 'limit' ||
    orderType === 'twap' ||
    orderType === 'stop' ||
    orderType === 'stop-loss' ||
    orderType === 'take-profit'

  if (!qty || Number(qty) <= 0) {
    throw new Error('Flash quote requires a positive qty')
  }
  if (chains.isCrossChain && orderType !== FLASH_MARKET_ORDER_TYPE) {
    throw new Error('Flash cross-chain trades support market orders only')
  }

  return {
    funderAddress: request.accountAddress,
    recipientAddress: request.accountAddress,
    targetChain: getFlashChainSlug(chains.targetChainId),
    contraChain: getFlashChainSlug(chains.contraChainId),
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
    ...(orderType === 'twap' && request.startTime?.trim() ? { startTime: request.startTime.trim() } : {}),
    ...(durationSeconds !== undefined ? { durationSeconds } : {}),
    ...(twapBucketCount !== undefined ? { twapBucketCount } : {}),
    ...(triggers?.length ? { triggers } : {})
  }
}

export const buildFlashQuoteBody = z
  .function({ input: [FlashBoundQuoteRequestSchema, FlashRuntimeSchema.default(flashRuntimeFromEnv)] })
  .implement(buildFlashQuoteBodyValidated)

function normalizeTx(tx: unknown, fallbackChainId: number): FlashQuoteTransactionRequest | null {
  const record = objectPayload(tx)
  const to = stringValue(record.to)
  const data = stringValue(record.data, '0x')

  if (!to) {
    return null
  }

  return {
    chainId: flashChainIdFromSlug(record.chainId) ?? fallbackChainId,
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
  if (!normalizedTx) {
    return null
  }

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
      ? [
          {
            label: 'Estimated fee (USD)',
            amount: estimatedFeeNotional
          } satisfies FlashQuoteFee
        ]
      : []
  }

  return rawFees.map((fee): FlashQuoteFee => {
    const record = objectPayload(fee)

    return {
      label: stringValue(record.label ?? record.name, 'Flash fee'),
      amount: stringValue(record.amount ?? record.value, '0'),
      asset: spentAsset
    }
  })
}

function parseTypedData(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value ?? null
  }

  const clean = value.trim()
  if (!clean) {
    return null
  }

  try {
    const parsed: unknown = JSON.parse(clean)

    return parsed && typeof parsed === 'object' ? parsed : value
  } catch {
    return value
  }
}

function serializeTypedData(value: unknown) {
  if (typeof value === 'string') {
    return value.trim() ? value : undefined
  }
  if (!value || typeof value !== 'object') {
    return undefined
  }

  return JSON.stringify(value)
}

export function normalizeFlashQuoteResponseValidated(
  payload: z.output<typeof FlashQuoteResponseSchema>,
  request: FlashBoundQuoteRequest,
  runtime: FlashRuntime
) {
  const quotePayload = objectPayload(payload.quote ?? payload)
  const targetAsset = request.targetAsset
  const contraAsset = request.contraAsset
  const side = request.side
  const orderType = request.orderType ?? FLASH_MARKET_ORDER_TYPE
  const chains = getFlashAssetPairChains({ side, targetAsset, contraAsset })
  requireSupportedChainId(chains.targetChainId, runtime)
  requireSupportedChainId(chains.contraChainId, runtime)
  if (chains.isCrossChain && orderType !== FLASH_MARKET_ORDER_TYPE) {
    throw new Error('Flash cross-chain trades support market orders only')
  }
  const spentAsset = getSpentAsset({ side, targetAsset, contraAsset })
  const receiveAsset = getReceiveAsset({ side, targetAsset, contraAsset })
  const fromPayload = objectPayload(quotePayload.from)
  const toPayload = objectPayload(quotePayload.to)
  const inputAmount = stringValue(
    fromPayload.amount ?? quotePayload.inputAmount ?? quotePayload.qty ?? request.qty ?? request.inputAmount
  )
  const outputAmount = stringValue(
    toPayload.amount ??
      quotePayload.outputAmount ??
      quotePayload.estimatedOutputAmount ??
      quotePayload.toAmount,
    '0'
  )
  const inputNotional = stringValue(
    fromPayload.notional ?? quotePayload.inputNotional ?? quotePayload.fromNotional
  )
  const outputNotional = stringValue(
    toPayload.notional ?? quotePayload.outputNotional ?? quotePayload.toNotional
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
  let rawQuoteId = payload.id
  if (quotePayload.quoteId !== undefined) {
    rawQuoteId = quotePayload.quoteId
  } else if (quotePayload.id !== undefined) {
    rawQuoteId = quotePayload.id
  } else if (payload.quoteId !== undefined) {
    rawQuoteId = payload.quoteId
  }
  const quoteId = stringValue(rawQuoteId)
  const bridgeQuoteId = stringValue(quotePayload.bridgeQuoteId ?? payload.bridgeQuoteId).trim()
  const wrapPayload = objectPayload(quotePayload.wrap ?? objectPayload(quotePayload.actions).wrap)
  const evmPayload = objectPayload(quotePayload.evm ?? objectPayload(quotePayload.actions).evm)
  const approvalPayload = objectPayload(
    quotePayload.approval ?? objectPayload(quotePayload.actions).approval ?? evmPayload.approval
  )
  const orderTypedDataSource =
    evmPayload.orderTypedData ??
    quotePayload.orderTypedData ??
    objectPayload(quotePayload.actions).orderTypedData ??
    null
  const permitTypedDataSource = evmPayload.permitTypedData ?? null
  const wrappedAssetAddress = stringValue(wrapPayload.wrappedAsset).trim()
  const approvalAsset =
    (wrappedAssetAddress
      ? getFlashAssetsForChain(chains.spentChainId).find(
          (asset) => normalizeAddress(toFlashApiAssetAddress(asset)) === normalizeAddress(wrappedAssetAddress)
        )
      : null) ?? spentAsset
  const wrapAction = quoteAction({
    amount: stringValue(wrapPayload.amount ?? inputAmount),
    amountRaw: stringValue(wrapPayload.amountRaw ?? wrapPayload.amountWei ?? '0'),
    asset: spentAsset,
    fallbackChainId: chains.spentChainId,
    kind: 'wrap',
    label: stringValue(wrapPayload.label, `Wrap ${spentAsset.symbol}`),
    tx: wrapPayload.evmTx ?? wrapPayload.tx
  })
  const approvalAction = quoteAction({
    amount: stringValue(approvalPayload.amount ?? inputAmount),
    amountRaw: stringValue(approvalPayload.amountRaw ?? approvalPayload.amountWei ?? '0'),
    asset: approvalAsset,
    fallbackChainId: chains.spentChainId,
    kind: 'approve',
    label: stringValue(approvalPayload.label, `Approve ${approvalAsset.symbol}`),
    spender: stringValue(approvalPayload.spender),
    tx: approvalPayload.evmTx ?? approvalPayload.tx ?? evmPayload.approveTx
  })
  const steps: FlashStep[] = []

  if (wrapAction) {
    steps.push({
      id: 'wrap',
      kind: 'wrap',
      label: wrapAction.label,
      status: 'required',
      asset: spentAsset
    })
  }
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
    rate: stringValue(quotePayload.rate ?? quotePayload.price ?? ''),
    fees: normalizeFees(quotePayload.fees, spentAsset),
    steps,
    actions: {
      wrap: wrapAction,
      approval: approvalAction
    },
    expiresAt: stringValue(quotePayload.expiresAt ?? quotePayload.expires_at ?? ''),
    raw: {
      ...quotePayload,
      quoteId,
      ...(bridgeQuoteId ? { bridgeQuoteId } : {}),
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
        orderTypedDataRaw: serializeTypedData(orderTypedDataSource) ?? null,
        permitTypedData: parseTypedData(permitTypedDataSource),
        permitTypedDataRaw: serializeTypedData(permitTypedDataSource) ?? null
      }
    }
  }

  return FlashQuoteSchema.parse(quote)
}

export const normalizeFlashQuoteResponse = z
  .function({
    input: [
      z.unknown().pipe(FlashQuoteResponseSchema),
      FlashBoundQuoteRequestSchema,
      FlashRuntimeSchema.default(flashRuntimeFromEnv)
    ]
  })
  .implement(normalizeFlashQuoteResponseValidated)

function quoteTypedData(quote: FlashQuote, field: 'orderTypedData' | 'permitTypedData') {
  const evm = objectPayload(objectPayload(quote.raw).evm)

  return evm[`${field}Raw`] ?? evm[field]
}

export function buildFlashSubmitBodyValidated(request: FlashSubmitOrderRequest, runtime: FlashRuntime) {
  const quote = request.quote
  const chains = getFlashAssetPairChains(quote)
  if (chains.isCrossChain && quote.orderType !== FLASH_MARKET_ORDER_TYPE) {
    throw new Error('Flash cross-chain trades support market orders only')
  }
  const quoteFields = buildFlashQuoteBodyValidated(
    {
      ...request,
      contraAsset: request.contraAsset,
      orderType: quote.orderType,
      qty: request.qty ?? request.inputAmount ?? quote.inputAmount,
      side: request.side,
      targetAsset: request.targetAsset
    },
    runtime
  )
  const evmOrderTypedData = serializeTypedData(
    request.evmOrderTypedData ?? quoteTypedData(quote, 'orderTypedData')
  )
  const evmPermitTypedData = serializeTypedData(
    request.evmPermitTypedData ?? quoteTypedData(quote, 'permitTypedData')
  )
  const quoteId = request.quoteId ?? quote.id
  const userSignature = request.orderSignature ?? request.signature
  const rawQuote = objectPayload(quote.raw)
  const bridgeQuoteId = request.bridgeQuoteId ?? stringValue(rawQuote.bridgeQuoteId).trim()
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
    ...(bridgeQuoteId ? { bridgeQuoteId } : {}),
    ...(userSignature ? { userSignature } : {}),
    ...(evmOrderTypedData ? { evmOrderTypedData } : {}),
    ...(evmPermitTypedData ? { evmPermitTypedData } : {}),
    ...(request.evmPermitSignature ? { evmPermitSignature: request.evmPermitSignature } : {})
  }
}

export const buildFlashSubmitBody = z
  .function({ input: [FlashSubmitOrderRequestSchema, FlashRuntimeSchema.default(flashRuntimeFromEnv)] })
  .implement(buildFlashSubmitBodyValidated)
