import { z } from 'zod'

import { TokenIdSchema } from './token.js'

const CoreBalanceSchema = z.object({
  balance: z.string().describe('Raw balance, in hex'),
  displayBalance: z.string()
})

export const BalanceSchema = CoreBalanceSchema.merge(TokenIdSchema)

export type Balance = z.infer<typeof BalanceSchema>
