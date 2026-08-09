import { z } from 'zod'

import { FLASH_ORDER_TYPES, FLASH_TRADE_SIDES } from './constants.js'

const FlashAddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/)
const FlashChainIdSchema = z.number().int().positive()
export const FlashTradeSideSchema = z.enum(FLASH_TRADE_SIDES)
export const FlashOrderTypeSchema = z.enum(FLASH_ORDER_TYPES)
const FlashStepKindSchema = z.enum(['wrap', 'approve', 'sign', 'submit'])
const FlashStepStatusSchema = z.enum(['idle', 'required', 'pending', 'complete', 'error', 'skipped'])

export const FlashAssetSchema = z.strictObject({
  id: z.string().min(1).max(256),
  symbol: z.string().min(1).max(32),
  name: z.string().min(1).max(128),
  decimals: z.number().int().min(0).max(255),
  chainId: FlashChainIdSchema,
  isNative: z.boolean(),
  address: FlashAddressSchema
})

const FlashStepSchema = z.object({
  id: z.string().min(1).max(256),
  kind: FlashStepKindSchema,
  label: z.string().min(1).max(256),
  status: FlashStepStatusSchema,
  asset: FlashAssetSchema.optional(),
  amount: z.string().optional(),
  txHash: z.string().optional(),
  error: z.string().optional()
})

const FlashQuoteFeeSchema = z.object({
  label: z.string(),
  amount: z.string(),
  asset: FlashAssetSchema.optional()
})

const FlashQuoteLegSchema = z.object({
  asset: z.enum(['target', 'contra']),
  amount: z.string(),
  notional: z.string()
})

const FlashQuoteTransactionRequestSchema = z.object({
  chainId: FlashChainIdSchema,
  from: FlashAddressSchema.optional(),
  to: FlashAddressSchema,
  data: z.string(),
  value: z.string().optional()
})

const FlashQuoteActionSchema = z.object({
  id: z.string(),
  kind: z.enum(['wrap', 'approve']),
  label: z.string(),
  asset: FlashAssetSchema,
  amount: z.string(),
  amountRaw: z.string(),
  spender: FlashAddressSchema.optional(),
  tx: FlashQuoteTransactionRequestSchema
})

const FlashQuoteActionsSchema = z.object({
  wrap: FlashQuoteActionSchema.nullable().optional(),
  approval: FlashQuoteActionSchema.nullable().optional()
})

export const FlashQuoteSchema = z.object({
  id: z.string().optional(),
  side: FlashTradeSideSchema,
  orderType: FlashOrderTypeSchema,
  targetAsset: FlashAssetSchema,
  contraAsset: FlashAssetSchema,
  spentAsset: FlashAssetSchema,
  receiveAsset: FlashAssetSchema,
  inputAmount: z.string(),
  outputAmount: z.string(),
  inputNotional: z.string().optional(),
  outputNotional: z.string().optional(),
  estimatedFeeNotional: z.string().optional(),
  targetNotionalPrice: z.string().optional(),
  from: FlashQuoteLegSchema.optional(),
  to: FlashQuoteLegSchema.optional(),
  rate: z.string().optional(),
  fees: z.array(FlashQuoteFeeSchema).optional(),
  steps: z.array(FlashStepSchema),
  actions: FlashQuoteActionsSchema.optional(),
  expiresAt: z.string().optional(),
  raw: z.unknown().optional()
})

export type FlashAsset = z.infer<typeof FlashAssetSchema>
export type FlashOrderType = z.infer<typeof FlashOrderTypeSchema>
export type FlashPriceTrigger = { notionalPrice: string; triggerType: 'upper' | 'lower' }
export type FlashQuote = z.infer<typeof FlashQuoteSchema>
export type FlashQuoteAction = z.infer<typeof FlashQuoteActionSchema>
export type FlashQuoteFee = z.infer<typeof FlashQuoteFeeSchema>
export type FlashQuoteTransactionRequest = z.infer<typeof FlashQuoteTransactionRequestSchema>
export type FlashRuntime = {
  environment?: string | null
  isDev?: boolean | null
  profile?: string | null
}
export type FlashStep = z.infer<typeof FlashStepSchema>
export type FlashTradeSide = z.infer<typeof FlashTradeSideSchema>
