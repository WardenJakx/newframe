import { z } from 'zod'

const FlashWireOrderSchema = z
  .looseObject({
    orderId: z.string().min(1).optional(),
    id: z.string().min(1).optional(),
    accountAddress: z.string().optional(),
    funderAddress: z.string().optional(),
    account: z.string().optional(),
    status: z.unknown().optional(),
    open: z.boolean().optional()
  })
  .refine((order) => Boolean(order.orderId ?? order.id), 'Flash order response has no order id')

const FlashQuoteLegSchema = z.looseObject({
  asset: z.enum(['target', 'contra']).optional().catch(undefined),
  amount: z.union([z.string(), z.number()]).optional().catch(''),
  notional: z.union([z.string(), z.number()]).optional().catch('')
})
const FlashToLegSchema = FlashQuoteLegSchema.extend({
  amount: z.union([z.string(), z.number()]).optional().catch('0')
})
const FlashQuotePayloadSchema = z.looseObject({
  from: FlashQuoteLegSchema.optional(),
  to: FlashToLegSchema.optional(),
  actions: z.looseObject({}).nullish(),
  evm: z.looseObject({}).nullish(),
  wrap: z.looseObject({}).nullish(),
  approval: z.looseObject({}).nullish()
})

export const FlashQuoteResponseSchema = FlashQuotePayloadSchema.extend({
  quote: FlashQuotePayloadSchema.optional()
})

export const FlashSubmitResponseSchema = z
  .looseObject({
    orderId: z.string().min(1).optional(),
    id: z.string().min(1).optional(),
    order: FlashWireOrderSchema.optional(),
    status: z.unknown().optional()
  })
  .refine(
    (response) => Boolean(response.orderId ?? response.order?.orderId ?? response.order?.id ?? response.id),
    'Flash order submit did not return an order id'
  )
  .transform((response) => ({
    ...response,
    orderId: z
      .string()
      .parse(response.orderId ?? response.order?.orderId ?? response.order?.id ?? response.id)
  }))

export const FlashListOrdersResponseSchema = z
  .union([z.array(FlashWireOrderSchema), z.looseObject({ orders: z.array(FlashWireOrderSchema) })])
  .transform((response) => (Array.isArray(response) ? { orders: response } : response))

export const FlashGetOrderResponseSchema = z
  .union([
    z.looseObject({
      order: FlashWireOrderSchema,
      accountAddress: z.string().optional(),
      funderAddress: z.string().optional(),
      account: z.string().optional()
    }),
    FlashWireOrderSchema
  ])
  .transform((response) => ({
    ...response,
    order: FlashWireOrderSchema.parse('order' in response ? response.order : response)
  }))

export const FlashCancelOrderResponseSchema = z.union([
  z.looseObject({ order: FlashWireOrderSchema.optional() }),
  z.null().transform(() => ({ order: undefined }))
])

const FlashTokenBalanceSchema = z.looseObject({
  chain: z.string(),
  address: z.string(),
  symbol: z.string(),
  tokenDecimals: z.number().int().nonnegative(),
  balance: z.string(),
  notional: z.string(),
  priceChange24h: z.string().nullable(),
  imageUrl: z.string(),
  isNative: z.boolean()
})

export const FlashBalancesResponseSchema = z.looseObject({
  balances: z.array(FlashTokenBalanceSchema)
})

export type FlashTokenBalance = z.infer<typeof FlashTokenBalanceSchema>

export const FlashWebSocketFrameSchema = z.union([
  z.object({
    channel: z.literal('subscriptions'),
    type: z.literal('ack'),
    subscriptions: z.array(z.string()).catch([])
  }),
  z.object({
    channel: z.literal('orders'),
    type: z.enum(['snapshot', 'update']),
    orders: z.array(z.unknown())
  }),
  z.object({
    type: z.literal('error'),
    code: z.string().catch('ERROR'),
    message: z.string().catch('')
  })
])
