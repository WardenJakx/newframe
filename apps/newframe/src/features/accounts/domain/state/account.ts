import { z } from 'zod'

import { SafeDeploymentSchema } from '../safe.ts'

export const AccountMetadataSchema = z
  .object({
    name: z.string(),
    lastUpdated: z.number().optional()
  })
  .loose()

export const AccountSchema = z
  .object({
    id: z.string().min(1),
    profileId: z.string().min(1),
    address: z.string().min(1),
    name: z.string(),
    lastSignerType: z.string(),
    status: z.string(),
    signer: z.string(),
    signerStatus: z.string().optional(),
    // Ledger Live path index, recorded so attaching a Ledger only derives the accounts already saved
    ledgerLiveIndex: z.number().int().nonnegative().optional(),
    safe: z.record(z.string().regex(/^[1-9][0-9]*$/), SafeDeploymentSchema).optional(),
    aiSessionsEnabled: z.boolean().optional(),
    requests: z.record(z.string(), z.unknown()),
    ensName: z.string().optional(),
    created: z.string()
  })
  .loose()

export type Account = z.infer<typeof AccountSchema>
