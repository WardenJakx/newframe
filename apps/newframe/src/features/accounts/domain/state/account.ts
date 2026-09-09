import { z } from 'zod'
import { SafeDeploymentSchema } from '../safe.js'

export const AccountMetadataSchema = z
  .object({
    name: z.string(),
    lastUpdated: z.number().optional()
  })
  .passthrough()

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
    safe: z.record(z.string().regex(/^[1-9][0-9]*$/), SafeDeploymentSchema).optional(),
    agentEnabled: z.boolean().optional(),
    requests: z.record(z.string(), z.unknown()),
    ensName: z.string().optional(),
    created: z.string()
  })
  .passthrough()

export type Account = z.infer<typeof AccountSchema>
