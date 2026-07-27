import { z } from 'zod'

import { FLASH_ORDER_TYPES, FLASH_TRADE_SIDES } from './constants'

export const FlashAddressSchema = z.string().regex(/^0x[0-9a-fA-F]{40}$/)
export const FlashChainIdSchema = z.number().int().positive()
export const FlashTradeSideSchema = z.enum(FLASH_TRADE_SIDES)
export const FlashOrderTypeSchema = z.enum(FLASH_ORDER_TYPES)
export const FlashStepKindSchema = z.enum(['wrap', 'approve', 'sign', 'submit'])
export const FlashStepStatusSchema = z.enum(['idle', 'required', 'pending', 'complete', 'error', 'skipped'])

export const FlashAssetSchema = z.strictObject({
  id: z.string().min(1).max(256),
  symbol: z.string().min(1).max(32),
  name: z.string().min(1).max(128),
  decimals: z.number().int().min(0).max(255),
  chainId: FlashChainIdSchema,
  isNative: z.boolean(),
  address: FlashAddressSchema
})

export const FlashStepSchema = z.object({
  id: z.string().min(1).max(256),
  kind: FlashStepKindSchema,
  label: z.string().min(1).max(256),
  status: FlashStepStatusSchema,
  asset: FlashAssetSchema.optional(),
  amount: z.string().optional(),
  txHash: z.string().optional(),
  error: z.string().optional()
})

export const FlashQuoteFeeSchema = z.object({
  label: z.string(),
  amount: z.string(),
  asset: FlashAssetSchema.optional()
})

export const FlashQuoteLegSchema = z.object({
  asset: z.enum(['target', 'contra']),
  amount: z.string(),
  notional: z.string()
})

export const FlashPriceTriggerSchema = z.strictObject({
  notionalPrice: z.string().min(1).max(128),
  triggerType: z.enum(['upper', 'lower'])
})

export const FlashQuoteTransactionRequestSchema = z.object({
  chainId: FlashChainIdSchema,
  from: FlashAddressSchema.optional(),
  to: FlashAddressSchema,
  data: z.string(),
  value: z.string().optional()
})

export const FlashQuoteActionSchema = z.object({
  id: z.string(),
  kind: z.enum(['wrap', 'approve']),
  label: z.string(),
  asset: FlashAssetSchema,
  amount: z.string(),
  amountRaw: z.string(),
  spender: FlashAddressSchema.optional(),
  tx: FlashQuoteTransactionRequestSchema
})

export const FlashQuoteActionsSchema = z.object({
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

export const FlashRuntimeSchema = z.object({
  environment: z.string().nullable().optional(),
  isDev: z.boolean().nullable().optional(),
  profile: z.string().nullable().optional()
})

export type FlashAsset = z.infer<typeof FlashAssetSchema>
export type FlashOrderType = z.infer<typeof FlashOrderTypeSchema>
export type FlashPriceTrigger = z.infer<typeof FlashPriceTriggerSchema>
export type FlashQuote = z.infer<typeof FlashQuoteSchema>
export type FlashQuoteAction = z.infer<typeof FlashQuoteActionSchema>
export type FlashQuoteActionKind = FlashQuoteAction['kind']
export type FlashQuoteActions = z.infer<typeof FlashQuoteActionsSchema>
export type FlashQuoteFee = z.infer<typeof FlashQuoteFeeSchema>
export type FlashQuoteLeg = z.infer<typeof FlashQuoteLegSchema>
export type FlashQuoteTransactionRequest = z.infer<typeof FlashQuoteTransactionRequestSchema>
export type FlashRuntime = z.infer<typeof FlashRuntimeSchema>
export type FlashStep = z.infer<typeof FlashStepSchema>
export type FlashStepKind = z.infer<typeof FlashStepKindSchema>
export type FlashStepStatus = z.infer<typeof FlashStepStatusSchema>
export type FlashTradeSide = z.infer<typeof FlashTradeSideSchema>
