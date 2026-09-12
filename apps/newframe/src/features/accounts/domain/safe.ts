import { getAddress, isAddress } from 'ethers'
import { z } from 'zod'

export const safeAddressSchema = z.string().refine(isAddress, 'Invalid address').transform(getAddress)
const safeDecimalSchema = z
  .string()
  .regex(/^(0|[1-9][0-9]*)$/)
  .max(78)
  .refine((value) => /^\d+$/.test(value) && BigInt(value) < 2n ** 256n, 'Integer exceeds uint256')
export const safeConfigurationSchema = z
  .strictObject({
    owners: z.array(safeAddressSchema).min(1).max(1000),
    threshold: z.number().int().positive(),
    nonce: safeDecimalSchema,
    version: z.string().max(100).optional()
  })
  .refine(
    (config) =>
      config.threshold <= config.owners.length && new Set(config.owners).size === config.owners.length,
    'Invalid owner threshold'
  )
export const safeDecodedSchema = z.strictObject({
  method: z.string().max(200),
  parameters: z
    .array(
      z.strictObject({ name: z.string().max(200), type: z.string().max(200), value: z.string().max(2000) })
    )
    .max(50)
})
export const safeProposalSchema = z.strictObject({
  safeTxHash: z
    .string()
    .regex(/^0x[0-9a-fA-F]{64}$/)
    .transform((hash) => hash.toLowerCase()),
  safe: safeAddressSchema,
  nonce: safeDecimalSchema,
  to: safeAddressSchema,
  value: safeDecimalSchema,
  operation: z.union([z.literal(0), z.literal(1)]),
  data: z
    .string()
    .regex(/^0x(?:[0-9a-fA-F]{2})*$/)
    .max(262146),
  confirmations: z.array(safeAddressSchema).max(1000),
  safeTxGas: safeDecimalSchema.optional(),
  baseGas: safeDecimalSchema.optional(),
  gasPrice: safeDecimalSchema.optional(),
  gasToken: safeAddressSchema.optional(),
  refundReceiver: safeAddressSchema.optional(),
  dataDecoded: safeDecodedSchema.optional(),
  localDecoded: safeDecodedSchema.extend({ source: z.string().max(200) }).optional(),
  integrity: z
    .strictObject({
      status: z.enum(['matched', 'mismatch', 'unavailable']),
      computedHash: z
        .string()
        .regex(/^0x[0-9a-f]{64}$/)
        .optional(),
      reason: z.string().max(500)
    })
    .optional()
})
const safeDeploymentSchema = z.strictObject({
  chainId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  address: safeAddressSchema,
  configuration: safeConfigurationSchema,
  pending: z.array(safeProposalSchema).optional(),
  refreshedAt: z.number().finite().nonnegative().optional(),
  error: z.string().max(2000).optional()
})
export type SafeConfiguration = z.infer<typeof safeConfigurationSchema>
export type SafeProposal = z.infer<typeof safeProposalSchema>
export type SafeDeployment = z.infer<typeof safeDeploymentSchema>

export const SafeDeploymentSchema = safeDeploymentSchema

export const SafeOwnerAccountSchema = z.strictObject({
  accountId: z.string(),
  name: z.string(),
  address: z.string(),
  created: z.string(),
  signerType: z.string(),
  signerAttached: z.boolean(),
  signerStatus: z.string(),
  status: z.enum(['ready', 'unavailable', 'watch-only'])
})
export type SafeOwnerAccount = z.infer<typeof SafeOwnerAccountSchema>

const simulationEffectSchema = z.strictObject({
  id: z.string(),
  kind: z.enum(['native', 'erc20', 'allowance']),
  direction: z.enum(['out', 'in', 'neutral']),
  label: z.string(),
  amount: z.string().optional(),
  decimals: z.number().int().nonnegative().optional(),
  symbol: z.string(),
  detail: z.string().optional(),
  assetAddress: z.string().optional(),
  spenderAddress: z.string().optional(),
  logoURI: z.string().optional()
})
const simulationContext = {
  assumptions: z.array(z.string()),
  currentNonce: safeDecimalSchema,
  blockNumber: safeDecimalSchema
}
export const SafeProposalSimulationSchema = z.discriminatedUnion('status', [
  z.strictObject({
    status: z.literal('success'),
    effects: z.array(simulationEffectSchema),
    ...simulationContext
  }),
  z.strictObject({
    status: z.literal('error'),
    error: z.string(),
    failure: z.enum(['revert', 'inner']),
    effects: z.array(simulationEffectSchema),
    ...simulationContext
  }),
  z.strictObject({
    status: z.literal('unavailable'),
    error: z.string(),
    assumptions: simulationContext.assumptions.optional(),
    currentNonce: simulationContext.currentNonce.optional(),
    blockNumber: simulationContext.blockNumber.optional()
  })
])
export type SafeProposalSimulation = z.infer<typeof SafeProposalSimulationSchema>
