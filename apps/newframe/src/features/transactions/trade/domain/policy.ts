export const FLASH_MIN_TWAP_DURATION_SECONDS = 300
export const FLASH_MAX_TWAP_DURATION_SECONDS = 2_592_000
export const FLASH_MIN_TWAP_BUCKET_COUNT = 2
export const FLASH_MAX_TWAP_BUCKET_COUNT = 2_560

export const cleanFlashDecimal = (value: unknown = '') =>
  String(value ?? '')
    .trim()
    .replace(/,/g, '')

export function positiveFlashNumber(value: unknown = '') {
  const parsed = Number(cleanFlashDecimal(value))
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

export function nonNegativeFlashInteger(value: unknown = '') {
  const parsed = Number(cleanFlashDecimal(value))
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : -1
}

export function flashDurationSeconds(fields: {
  durationDays?: string
  durationHours?: string
  durationMinutes?: string
}) {
  const days = nonNegativeFlashInteger(fields.durationDays)
  const hours = nonNegativeFlashInteger(fields.durationHours)
  const minutes = nonNegativeFlashInteger(fields.durationMinutes)
  return days < 0 || hours < 0 || hours > 23 || minutes < 0 || minutes > 59
    ? 0
    : days * 86_400 + hours * 3_600 + minutes * 60
}

const FLASH_REQUEST_KEY_FIELDS = [
  'accountAddress',
  'chainId',
  'side',
  'orderType',
  'qty',
  'slippage',
  'quickTrade',
  'limitNotionalPrice',
  'triggers',
  'durationSeconds',
  'startTime',
  'twapBucketCount',
  'maxPriceImpact',
  'expireTime'
] as const

type FlashRequestKeyInput = Partial<Record<(typeof FLASH_REQUEST_KEY_FIELDS)[number], unknown>> & {
  targetAsset: { id: string }
  contraAsset: { id: string }
}

export const flashRequestKey = (request: FlashRequestKeyInput) =>
  JSON.stringify([
    ...FLASH_REQUEST_KEY_FIELDS.map((field) => request[field]),
    request.targetAsset.id,
    request.contraAsset.id
  ])
