import { z } from 'zod'

export const AssetRateSourceSchema = z.enum(['zerion', 'flash'])
export type AssetRateSource = z.infer<typeof AssetRateSourceSchema>

export const AssetRateReferenceSchema = z.object({
  chainId: z.number(),
  address: z.string(),
  nativeTicker: z.string().optional()
})
export type AssetRateReference = z.infer<typeof AssetRateReferenceSchema>

export const AssetRateInputSchema = AssetRateReferenceSchema.extend({
  usdRate: z.number(),
  change24hr: z.number().optional(),
  observedAt: z.number().optional()
})
export type AssetRateInput = z.infer<typeof AssetRateInputSchema>

export const AssetRateSnapshotSchema = z.object({
  usdRate: z.number(),
  change24hr: z.number().optional(),
  source: AssetRateSourceSchema,
  observedAt: z.number()
})
export type AssetRateSnapshot = z.infer<typeof AssetRateSnapshotSchema>

export const AssetRateMapSchema = z.record(z.string(), AssetRateSnapshotSchema)
export type AssetRateMap = z.infer<typeof AssetRateMapSchema>

export type ResolvedAssetRate =
  | AssetRateSnapshot
  | {
      usdRate: number
      change24hr?: number
      source: 'fixed'
    }
