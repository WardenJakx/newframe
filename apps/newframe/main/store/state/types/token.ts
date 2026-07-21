import { z } from 'zod'

export const TokenIdSchema = z.object({
  address: z.string(),
  chainId: z.coerce.number()
})

export type WithTokenId = z.infer<typeof TokenIdSchema>

export const TokenImageSchema = z.strictObject({
  base64: z.string(),
  contentHash: z.string(),
  mimeType: z.string(),
  sourceUrl: z.string().optional()
})

export const TokenSourceSchema = z.enum(['bundled', 'custom', 'onchain', 'portfolio', 'transaction'])

export const TokenSchema = TokenIdSchema.extend({
  name: z.string(),
  symbol: z.string(),
  decimals: z.number().int().min(0).max(255),
  logoURI: z.string().optional(),
  image: TokenImageSchema.optional(),
  custom: z.boolean().default(false),
  curated: z.boolean().default(false),
  sources: z.array(TokenSourceSchema).default([]),
  updatedAt: z.number().default(0)
})

export const TokenCatalogSchema = z.strictObject({
  byId: z.record(z.string(), TokenSchema),
  accountTokenIds: z.record(z.string(), z.array(z.string()))
})

export type TokenImage = z.infer<typeof TokenImageSchema>
export type TokenSource = z.infer<typeof TokenSourceSchema>
export type Token = WithTokenId & {
  name: string
  symbol: string
  decimals: number
  logoURI?: string
  image?: TokenImage
  custom?: boolean
  curated?: boolean
  sources?: TokenSource[]
  updatedAt?: number
}
export type TokenRecord = z.infer<typeof TokenSchema>
export type TokenCatalog = z.infer<typeof TokenCatalogSchema>
