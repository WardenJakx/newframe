import { z } from 'zod'

export const AccountAccessGrantSchema = z.object({
  origin: z.string(),
  provider: z.boolean().default(false).describe('Whether or not to grant access to this origin'),
  requestId: z.string()
})

export type AccountAccessGrant = z.infer<typeof AccountAccessGrantSchema>
