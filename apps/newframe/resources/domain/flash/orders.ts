import { z } from 'zod'

import { FlashAssetSchema, FlashOrderTypeSchema, FlashTradeSideSchema } from './schemas'

export const FlashOrderStatusSchema = z.enum([
  'pending',
  'accepted',
  'partially-filled',
  'filled',
  'cancelled',
  'rejected',
  'terminated',
  'expired'
])

export const FlashOrderRecordSchema = z.object({
  orderId: z.string().min(1),
  accountAddress: z.string(),
  chainId: z.number().int().positive(),
  provider: z.literal('flash'),
  source: z.literal('flash'),
  environment: z.string(),
  profile: z.string().nullable(),
  status: FlashOrderStatusSchema,
  rawStatus: z.string(),
  orderType: FlashOrderTypeSchema,
  side: FlashTradeSideSchema,
  targetAsset: FlashAssetSchema,
  contraAsset: FlashAssetSchema,
  qty: z.string(),
  spentAsset: FlashAssetSchema,
  spentAmount: z.string(),
  outputAmount: z.string(),
  estimatedOutputAmount: z.string(),
  filledOutputAmount: z.string().nullable().optional(),
  averageFillPrice: z.string().nullable().optional(),
  createdAt: z.number(),
  updatedAt: z.number(),
  terminalAt: z.number().nullable().optional(),
  open: z.boolean(),
  cancellable: z.boolean(),
  quoteId: z.string().optional(),
  receiveAsset: FlashAssetSchema,
  rate: z.string().optional(),
  rawPayload: z.unknown().optional(),
  rawStatusPayload: z.unknown().optional(),
  fillHash: z.string().nullable().optional(),
  fillTransactionHash: z.string().nullable().optional()
})

export type FlashOrderRecord = z.infer<typeof FlashOrderRecordSchema>
export type FlashOrderStatus = z.infer<typeof FlashOrderStatusSchema>
