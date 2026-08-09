import type { FlashQuote, FlashQuoteAction } from './schemas.js'
import { getFlashAssetPairChains } from './pair.js'
import { getFlashChainSlug } from './chains.js'

export type FlashTypedDataField =
  | 'orderTypedData'
  | 'orderTypedDataRaw'
  | 'permitTypedData'
  | 'permitTypedDataRaw'

export function flashObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function nestedValue(value: unknown, path: string[]) {
  return path.reduce<unknown>((current, key) => flashObject(current)[key], value)
}

export function findFlashTypedData(quote: FlashQuote, flashPayload: unknown, field: FlashTypedDataField) {
  const quoteRaw = flashObject(quote.raw)
  return (
    nestedValue(flashPayload, ['actions', 'evm', field]) ||
    nestedValue(flashPayload, ['evm', field]) ||
    nestedValue(flashPayload, [field]) ||
    nestedValue(quoteRaw, ['actions', 'evm', field]) ||
    nestedValue(quoteRaw, ['evm', field]) ||
    nestedValue(quoteRaw, [field])
  )
}

export function parseFlashTypedData(value: unknown) {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

function serializeFlashTypedData(value: unknown) {
  if (typeof value === 'string') return value
  return value ? JSON.stringify(value) : ''
}

export function flashTypedDataChainId(typedData: unknown, fallback: number) {
  const value = flashObject(flashObject(typedData).domain).chainId
  if (value === undefined || value === null || value === '') return fallback
  const parsed =
    typeof value === 'string' && value.toLowerCase().startsWith('0x')
      ? Number.parseInt(value, 16)
      : Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error('Invalid Flash chain id')
  return parsed
}

export function buildFlashActionTransaction(action: FlashQuoteAction, expectedChainId: number) {
  const chainId = Number(action.tx.chainId ?? expectedChainId)
  if (!Number.isInteger(chainId) || chainId <= 0 || chainId !== expectedChainId) {
    throw new Error('Invalid Flash action chain id')
  }
  return {
    chainId,
    transaction: {
      to: action.tx.to,
      data: action.tx.data,
      value: action.tx.value || '0x0'
    }
  }
}

export function buildFlashSubmitRequest<TRequest extends object>({
  accountAddress,
  bridgeQuoteId,
  flashPayload,
  idempotencyKey,
  orderSignature,
  permitSignature,
  quote,
  quoteId,
  quoteRequest
}: {
  accountAddress: string
  bridgeQuoteId?: string
  flashPayload: unknown
  idempotencyKey: string
  orderSignature: string
  permitSignature?: string
  quote: FlashQuote
  quoteId?: string
  quoteRequest: TRequest
}) {
  const chains = getFlashAssetPairChains(quote)
  const orderTypedData = findFlashTypedData(quote, flashPayload, 'orderTypedData')
  const orderTypedDataRaw = findFlashTypedData(quote, flashPayload, 'orderTypedDataRaw') || orderTypedData
  const permitTypedData = findFlashTypedData(quote, flashPayload, 'permitTypedData')
  const permitTypedDataRaw = findFlashTypedData(quote, flashPayload, 'permitTypedDataRaw') || permitTypedData
  if (permitTypedData && !permitSignature) throw new Error('Flash quote requires a permit signature.')

  return {
    ...quoteRequest,
    accountAddress,
    funderAddress: accountAddress,
    recipientAddress: accountAddress,
    contraChain: getFlashChainSlug(chains.contraChainId),
    targetChain: getFlashChainSlug(chains.targetChainId),
    quote,
    ...(quoteId ? { quoteId } : {}),
    ...(bridgeQuoteId ? { bridgeQuoteId } : {}),
    rawPayload: flashPayload || quote.raw || null,
    evmOrderTypedData: serializeFlashTypedData(orderTypedDataRaw),
    ...(permitTypedDataRaw
      ? {
          evmPermitSignature: permitSignature,
          evmPermitTypedData: serializeFlashTypedData(permitTypedDataRaw)
        }
      : {}),
    signature: orderSignature,
    orderSignature,
    idempotencyKey
  }
}
