import { z } from 'zod'

const AssetRateSourceSchema = z.enum(['zerion', 'flash'])
export type AssetRateSource = z.infer<typeof AssetRateSourceSchema>

export type AssetRateReference = {
  chainId: number
  address: string
  nativeTicker?: string
}

export type AssetRateInput = AssetRateReference & {
  usdRate: number
  change24hr?: number
  observedAt?: number
}

const AssetRateSnapshotSchema = z.object({
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
