import { z } from 'zod'

import { ChainIdSchema } from '../../../chains/domain/state/chain.ts'
import { TokenImageSchema } from '../../../tokens/domain/state/token.ts'

const SessionSchema = z.object({
  requests: z.number().gte(0),
  startedAt: z.number().gte(0),
  endedAt: z.number().gte(0).optional(),
  lastUpdatedAt: z.number().gte(0)
})

export const OriginSchema = z.object({
  chain: ChainIdSchema,
  name: z.string(),
  faviconSource: z.string().optional(),
  image: TokenImageSchema.optional(),
  session: SessionSchema
})

export type Origin = z.infer<typeof OriginSchema>
