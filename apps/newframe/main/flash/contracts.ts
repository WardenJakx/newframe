import { z } from 'zod'

import {
  FlashAssetSchema,
  FlashOrderTypeSchema,
  FlashQuoteSchema,
  FlashTradeSideSchema
} from '../../resources/domain/flash/schemas'

const NumberOrStringSchema = z.union([z.number(), z.string()])
const FlashPriceTriggerInputSchema = z.object({
  notionalPrice: NumberOrStringSchema.optional(),
  triggerType: z.enum(['lower', 'upper']).optional()
})
const FlashChainInputSchema = z.union([
  NumberOrStringSchema,
  z.object({ id: NumberOrStringSchema.optional(), chainId: NumberOrStringSchema.optional() }),
  z.null()
])

export const FlashQuoteRequestSchema = z.object({
  accountAddress: z.string().optional(),
  targetChain: FlashChainInputSchema.optional(),
  contraChain: FlashChainInputSchema.optional(),
  chainId: NumberOrStringSchema.optional(),
  targetAsset: FlashAssetSchema.optional(),
  contraAsset: FlashAssetSchema.optional(),
  side: FlashTradeSideSchema.optional(),
  qty: z.string().optional(),
  inputAmount: z.string().optional(),
  orderType: FlashOrderTypeSchema.optional(),
  slippage: NumberOrStringSchema.optional(),
  maxPriceImpact: NumberOrStringSchema.optional(),
  quickTrade: z.boolean().optional(),
  durationSeconds: NumberOrStringSchema.optional(),
  expireTime: z.string().optional(),
  limitNotionalPrice: NumberOrStringSchema.optional(),
  stopLossNotionalPrice: NumberOrStringSchema.optional(),
  takeProfitNotionalPrice: NumberOrStringSchema.optional(),
  triggerNotionalPrice: NumberOrStringSchema.optional(),
  triggers: z.array(FlashPriceTriggerInputSchema).optional(),
  twapBucketCount: NumberOrStringSchema.optional()
})

export const FlashSubmitOrderRequestSchema = FlashQuoteRequestSchema.extend({
  evmOrderTypedData: z.unknown().optional(),
  evmPermitSignature: z.string().optional(),
  evmPermitTypedData: z.unknown().optional(),
  quote: FlashQuoteSchema.optional(),
  quoteId: z.string().optional(),
  signature: z.string().optional(),
  orderSignature: z.string().optional(),
  rawPayload: z.unknown().optional(),
  idempotencyKey: z.string().optional()
})

export const FlashListOrdersRequestSchema = z.object({
  accountAddress: z.string().optional(),
  chainId: NumberOrStringSchema.optional(),
  pageSize: z.number().optional(),
  status: z.union([z.string(), z.array(z.string())]).optional()
})

export const FlashGetOrderRequestSchema = z.object({
  accountAddress: z.string().optional(),
  orderId: z.string().min(1)
})

export const FlashCancelOrderRequestSchema = z.object({
  cancelMessage: z.unknown().optional(),
  orderId: z.string().min(1),
  signature: z.string().optional(),
  userSignature: z.string().optional()
})

export type FlashChainInput = z.infer<typeof FlashChainInputSchema> | undefined
export type FlashPriceTriggerInput = z.infer<typeof FlashPriceTriggerInputSchema>
export type FlashQuoteRequest = z.infer<typeof FlashQuoteRequestSchema>
export type FlashSubmitOrderRequest = z.infer<typeof FlashSubmitOrderRequestSchema>
export type FlashListOrdersRequest = z.infer<typeof FlashListOrdersRequestSchema>
export type FlashGetOrderRequest = z.infer<typeof FlashGetOrderRequestSchema>
export type FlashCancelOrderRequest = z.infer<typeof FlashCancelOrderRequestSchema>
