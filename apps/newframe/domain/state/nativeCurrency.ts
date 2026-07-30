import { z } from 'zod'
import { TokenImageSchema } from './token.js'

export const NativeCurrencySchema = z.object({
  symbol: z.string(),
  icon: z.string().default(''),
  image: TokenImageSchema.optional(),
  name: z.string(),
  decimals: z.number()
})

export type NativeCurrency = z.infer<typeof NativeCurrencySchema>
