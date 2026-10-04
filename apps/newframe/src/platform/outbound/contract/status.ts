import { z } from 'zod'

/** The route outbound actually uses this run. A changed preference applies after restart. */
export const TorStatusSchema = z.strictObject({
  available: z.boolean(),
  connection: z.enum(['direct', 'connecting', 'connected', 'error'])
})

export type TorStatus = z.infer<typeof TorStatusSchema>
