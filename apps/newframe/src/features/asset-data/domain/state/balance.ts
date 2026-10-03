import { z } from 'zod'

import { TokenIdSchema } from '../../../tokens/domain/state/token.js'

const CoreBalanceSchema = z.object({
  balance: z.string().describe('Raw balance, in hex'),
  displayBalance: z.string()
})

export const BalanceSchema = CoreBalanceSchema.extend(TokenIdSchema.shape)

export type Balance = z.infer<typeof BalanceSchema>
