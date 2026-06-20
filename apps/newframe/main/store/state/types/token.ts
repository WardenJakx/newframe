import { z } from 'zod'

export const TokenIdSchema = z.object({
  address: z.string(),
  chainId: z.coerce.number()
})

export type WithTokenId = z.infer<typeof TokenIdSchema>

export type Token = WithTokenId & {
  name: string
  symbol: string
  decimals: number
  logoURI?: string
}
