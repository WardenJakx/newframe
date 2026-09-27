import { z } from 'zod'

import { FlashBoundQuoteRequestSchema, FlashSubmitOrderRequestSchema } from './contracts.js'
import {
  buildFlashQuoteBodyValidated,
  buildFlashSubmitBodyValidated,
  normalizeFlashQuoteResponseValidated
} from './protocol.js'
import { flashRuntimeFromEnv } from './runtime.js'
import { FlashQuoteSchema, type FlashRuntime } from './schemas.js'
import { flashRawStatus, normalizeFlashStatus } from './status.js'
import {
  FlashCancelOrderResponseSchema,
  FlashGetOrderResponseSchema,
  FlashListOrdersResponseSchema,
  FlashQuoteResponseSchema,
  FlashSubmitResponseSchema
} from './wire.js'

const FLASH_DEV_BASE_URL = 'http://127.0.0.1:8422/v1'
const FLASH_PROD_BASE_URL = 'https://flash.definitive.fi/v1'
const FLASH_API_KEY = 'dpka_513a2bd7_57a2_46d2_927b_2a3857fe271b'
const AddressSchema = z
  .string()
  .trim()
  .regex(/^0x[0-9a-fA-F]{40}$/)
const OrderIdSchema = z.string().min(1)
const SignatureSchema = z.string().min(1)
const ListOptionsSchema = z.object({
  status: z.union([z.string(), z.array(z.string())]).optional(),
  pageSize: z.number().int().positive().optional()
})
const QuoteFunction = z.function({
  input: [FlashBoundQuoteRequestSchema],
  output: z.object({ quote: FlashQuoteSchema, flash: z.unknown(), raw: FlashQuoteResponseSchema })
})
const SubmitOrderFunction = z.function({
  input: [FlashSubmitOrderRequestSchema],
  output: FlashSubmitResponseSchema
})
const ListOrdersFunction = z.function({
  input: [AddressSchema, ListOptionsSchema.default({})],
  output: FlashListOrdersResponseSchema
})
const GetOrderFunction = z.function({
  input: [AddressSchema, OrderIdSchema],
  output: FlashGetOrderResponseSchema
})
const CancelOrderFunction = z.function({
  input: z.tuple([OrderIdSchema, SignatureSchema]).rest(z.string().min(1)),
  output: FlashCancelOrderResponseSchema
})

export function flashApiKey() {
  return FLASH_API_KEY
}

export function flashBaseUrl(runtime: FlashRuntime = flashRuntimeFromEnv()): string {
  return runtime.isDev ? FLASH_DEV_BASE_URL : FLASH_PROD_BASE_URL
}

export function flashWebSocketUrl(runtime: FlashRuntime = flashRuntimeFromEnv()) {
  const url = new URL(flashBaseUrl(runtime))
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = `${url.pathname.replace(/\/$/, '')}/ws`
  return url.toString()
}

export function flashHeaders(runtime: FlashRuntime = flashRuntimeFromEnv(), baseUrl = flashBaseUrl(runtime)) {
  const headers: Record<string, string> = { accept: 'application/json', 'content-type': 'application/json' }
  if (!runtime.isDev && new URL(baseUrl).origin === new URL(FLASH_PROD_BASE_URL).origin) {
    headers['x-definitive-api-key'] = FLASH_API_KEY
  }
  return headers
}

export function flashCancelMessage(orderId: string) {
  return `Definitive Flash v1 — Cancel Order\nOrder: ${orderId}`
}

function errorMessage(payload: unknown, fallback: string) {
  if (typeof payload === 'string') {
    return payload || fallback
  }
  try {
    return JSON.stringify(payload) || fallback
  } catch {
    return String(payload) || fallback
  }
}

export class FlashApiError extends Error {
  constructor(
    readonly status: number,
    statusText: string,
    message: string
  ) {
    super(`Flash API ${status} ${statusText}: ${message}`)
  }
}

export interface FlashApiOptions {
  baseUrl?: string
  fetch?: (input: string | URL | Request, init?: RequestInit) => Promise<Response>
  runtime?: FlashRuntime
}

export function createFlashApi(options: FlashApiOptions = {}) {
  const baseUrl = (options.baseUrl ?? flashBaseUrl(options.runtime)).replace(/\/$/, '')
  const runtime = options.runtime ?? {
    isDev: /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(baseUrl) || flashRuntimeFromEnv().isDev
  }
  const fetcher = options.fetch ?? ((input: string | URL | Request, init?: RequestInit) => fetch(input, init))

  async function request(path: string, init: RequestInit = {}): Promise<unknown> {
    const headers = new Headers(flashHeaders(runtime, baseUrl))
    new Headers(init.headers).forEach((value, name) => headers.set(name, value))
    const response = await fetcher(`${baseUrl}${path}`, { ...init, headers })
    const text = await response.text()
    let payload: unknown = text || null
    if (text) {
      try {
        payload = JSON.parse(text) as unknown
      } catch {
        /* Flash may return plain text errors. */
      }
    }
    if (!response.ok) {
      throw new FlashApiError(
        response.status,
        response.statusText,
        errorMessage(payload, response.statusText)
      )
    }
    return payload
  }

  return {
    quote: QuoteFunction.implementAsync(async (input) => {
      const raw = FlashQuoteResponseSchema.parse(
        await request('/quote', {
          method: 'POST',
          body: JSON.stringify(buildFlashQuoteBodyValidated(input, runtime))
        })
      )
      const quote = normalizeFlashQuoteResponseValidated(raw, input, runtime)
      return { quote, flash: quote.raw ?? raw, raw }
    }),
    submitOrder: SubmitOrderFunction.implementAsync(async (input) => {
      return FlashSubmitResponseSchema.parse(
        await request('/order', {
          method: 'POST',
          ...(input.idempotencyKey ? { headers: { 'Idempotency-Key': input.idempotencyKey } } : {}),
          body: JSON.stringify(buildFlashSubmitBodyValidated(input, runtime))
        })
      )
    }),
    listOrders: ListOrdersFunction.implementAsync(async (accountAddress, options) => {
      const query = new URLSearchParams({ funderAddress: accountAddress })
      if (options.status) {
        const statuses = Array.isArray(options.status) ? options.status : options.status.split(',')
        query.set(
          'statuses',
          statuses.map((status) => flashRawStatus(normalizeFlashStatus(status))).join(',')
        )
      }
      if (options.pageSize) {
        query.set('pageSize', String(Math.min(200, options.pageSize)))
      }
      return FlashListOrdersResponseSchema.parse(await request(`/orders?${query}`))
    }),
    getOrder: GetOrderFunction.implementAsync(async (accountAddress, orderId) => {
      const query = new URLSearchParams({ funderAddress: accountAddress })
      return FlashGetOrderResponseSchema.parse(
        await request(`/orders/${encodeURIComponent(orderId)}?${query}`)
      )
    }),
    cancelOrder: CancelOrderFunction.implementAsync(async (orderId, userSignature, ...messages) => {
      return FlashCancelOrderResponseSchema.parse(
        await request(`/orders/${encodeURIComponent(orderId)}/cancel`, {
          method: 'POST',
          body: JSON.stringify({
            cancelMessage: messages[0] ?? flashCancelMessage(orderId),
            userSignature
          })
        })
      )
    })
  }
}
