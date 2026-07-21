import { z } from 'zod'

import { MainSchema } from '../state/types/main'
import { TokenCatalogSchema } from '../state/types/token'

export const PERSISTENCE_VERSION = 3
export const CANONICAL_STATE_STORAGE_NAME = 'canonical-wallet-state'

const DerivationSchema = z.enum(['live', 'legacy', 'standard', 'testnet'])
const PersistedMainSchema = z.strictObject({
  ...MainSchema.omit({ appLock: true, balances: true, runtime: true }).partial().shape,
  lattice: z
    .record(
      z.string(),
      z.strictObject({
        deviceId: z.string().optional(),
        deviceName: z.string(),
        tag: z.string(),
        privKey: z.string().regex(/^[0-9a-fA-F]{64}$/),
        paired: z.boolean(),
        baseUrl: z.string().optional(),
        endpointMode: z.enum(['default', 'custom']).optional()
      })
    )
    .optional(),
  latticeSettings: z
    .strictObject({
      accountLimit: z.number().int().min(1).max(100),
      derivation: DerivationSchema,
      endpointMode: z.enum(['default', 'custom']),
      endpointCustom: z.string().max(4_096)
    })
    .optional(),
  ledger: z
    .strictObject({
      derivation: DerivationSchema,
      liveAccountLimit: z.number().int().min(1).max(100)
    })
    .optional(),
  tokens: TokenCatalogSchema.optional(),
  trezor: z.strictObject({ derivation: DerivationSchema }).optional()
})

export const PersistedCanonicalStateSchema = z.strictObject({
  main: PersistedMainSchema
})

export const PersistedEnvelopeSchema = z.strictObject({
  state: PersistedCanonicalStateSchema,
  version: z.literal(PERSISTENCE_VERSION)
})

export const StoredEnvelopeSchema = z.strictObject({
  state: z.unknown(),
  version: z.number().int().nonnegative()
})

export type PersistedCanonicalState = z.infer<typeof PersistedCanonicalStateSchema>
