import {
  AbiCoder,
  dataSlice,
  getAddress,
  getBytes,
  hashMessage,
  isAddress,
  recoverAddress,
  toBigInt
} from 'ethers'
import { z } from 'zod'

export const safeAddressSchema = z.string().refine(isAddress, 'Invalid address').transform(getAddress)

// Safe stores eth_sign recovery values as 31/32, EIP712 as 27/28.
export function recoverSafeConfirmationOwner(hash: string, signature: string): string | undefined {
  if (!/^0x[0-9a-f]{64}$/i.test(hash) || !/^0x[0-9a-f]{130}$/i.test(signature)) {
    return undefined
  }
  const v = Number.parseInt(signature.slice(-2), 16)
  if (![27, 28, 31, 32].includes(v)) {
    return undefined
  }
  try {
    const digest = v > 30 ? hashMessage(getBytes(hash)) : hash
    const normalized = `${signature.slice(0, -2)}${(v > 30 ? v - 4 : v).toString(16).padStart(2, '0')}`
    return getAddress(recoverAddress(digest, normalized))
  } catch {
    return undefined
  }
}
const MAX_SAFE_BATCH_ACTIONS = 100
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
export const safeCallDecodedSchema = safeDecodedSchema.extend({
  source: z.string().max(200),
  contractName: z.string().max(200).optional()
})
const safeOperationSchema = z.union([z.literal(0), z.literal(1)])
const safeCalldataSchema = z
  .string()
  .regex(/^0x(?:[0-9a-fA-F]{2})*$/)
  .max(262146)
const safeActionSchema = z.strictObject({
  operation: safeOperationSchema,
  to: safeAddressSchema,
  value: safeDecimalSchema,
  data: safeCalldataSchema,
  decoded: safeCallDecodedSchema.optional()
})
const safeHashSchema = z
  .string()
  .regex(/^0x[0-9a-fA-F]{64}$/)
  .transform((hash) => hash.toLowerCase())
const safeSignatureSchema = z.string().regex(/^0x[0-9a-fA-F]{130}$/)
const safeProposalLocalSchema = z.strictObject({
  createdAt: z.number().nonnegative(),
  origin: z.string().max(200).optional(),
  requestId: z.string().max(256).optional(),
  confirmations: z
    .array(
      z.strictObject({
        owner: safeAddressSchema,
        signature: safeSignatureSchema
      })
    )
    .max(1000)
    .refine(
      (confirmations) =>
        new Set(confirmations.map(({ owner }) => owner.toLowerCase())).size === confirmations.length,
      'Duplicate local Safe confirmation'
    ),
  publication: z.strictObject({
    status: z.enum(['local', 'publishing', 'published', 'failed']),
    error: z.string().max(2000).optional()
  }),
  execution: z.strictObject({
    status: z.enum(['idle', 'preparing', 'ready', 'executing', 'submitted', 'failed', 'cancelled']),
    executorId: safeAddressSchema.optional(),
    transaction: z
      .strictObject({
        chainId: z.string().regex(/^0x[0-9a-fA-F]+$/),
        type: z.string().regex(/^0x[0-9a-fA-F]+$/),
        gasFeesSource: z.enum(['Dapp', 'Frame']),
        from: safeAddressSchema,
        to: safeAddressSchema,
        value: z.string().regex(/^0x[0-9a-fA-F]+$/),
        data: z.string().regex(/^0x(?:[0-9a-fA-F]{2})*$/),
        nonce: z.string().regex(/^0x[0-9a-fA-F]+$/),
        gasLimit: z.string().regex(/^0x[0-9a-fA-F]+$/),
        gasPrice: z
          .string()
          .regex(/^0x[0-9a-fA-F]+$/)
          .optional(),
        maxFeePerGas: z
          .string()
          .regex(/^0x[0-9a-fA-F]+$/)
          .optional(),
        maxPriorityFeePerGas: z
          .string()
          .regex(/^0x[0-9a-fA-F]+$/)
          .optional(),
        warning: z.string().max(2000).optional()
      })
      .optional(),
    warnings: z.array(z.string().max(2000)).max(20).optional(),
    transactionHash: safeHashSchema.optional(),
    error: z.string().max(2000).optional()
  })
})
export const safeProposalSchema = z
  .strictObject({
    safeTxHash: safeHashSchema,
    safe: safeAddressSchema,
    nonce: safeDecimalSchema,
    to: safeAddressSchema,
    value: safeDecimalSchema,
    operation: safeOperationSchema,
    data: safeCalldataSchema,
    confirmations: z.array(safeAddressSchema).max(1000),
    safeTxGas: safeDecimalSchema.optional(),
    baseGas: safeDecimalSchema.optional(),
    gasPrice: safeDecimalSchema.optional(),
    gasToken: safeAddressSchema.optional(),
    refundReceiver: safeAddressSchema.optional(),
    dataDecoded: safeDecodedSchema.optional(),
    localDecoded: safeCallDecodedSchema.optional(),
    batch: z.array(safeActionSchema).min(1).max(MAX_SAFE_BATCH_ACTIONS).optional(),
    local: safeProposalLocalSchema.optional(),
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
  .superRefine((proposal, context) => {
    proposal.local?.confirmations.forEach((confirmation, index) => {
      if (recoverSafeConfirmationOwner(proposal.safeTxHash, confirmation.signature) !== confirmation.owner) {
        context.addIssue({
          code: 'custom',
          message: 'Local Safe confirmation does not match its owner',
          path: ['local', 'confirmations', index, 'signature']
        })
      }
    })
  })
const safeDeploymentSchema = z.strictObject({
  chainId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  address: safeAddressSchema,
  configuration: safeConfigurationSchema,
  configurationBlockNumber: safeDecimalSchema.optional(),
  pending: z.array(safeProposalSchema).optional(),
  refreshedAt: z.number().nonnegative().optional(),
  error: z.string().max(2000).optional()
})
export type SafeConfiguration = z.infer<typeof safeConfigurationSchema>
export type SafeCallDecoded = z.infer<typeof safeCallDecodedSchema>
export type SafeAction = z.infer<typeof safeActionSchema>
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

// Official MultiSend and MultiSendCallOnly deployments (v1.3.0 canonical, eip155 and zkSync; v1.4.1; v1.5.0):
// https://github.com/safe-global/safe-deployments/tree/main/src/assets
const MULTI_SEND_ADDRESSES = new Set(
  [
    '0xA238CBeb142c10Ef7Ad8442C6D1f9E89e07e7761',
    '0x998739BFdAAdde7C933B942a68053933098f9EDa',
    '0x0dFcccB95225ffB03c6FBB2559B530C2B7C8A912',
    '0x40A2aCCbd92BCA938b02010E17A5b8929b49130D',
    '0xA1dabEF33b3B82c7814B6D82A79e50F4AC44102B',
    '0xf220D3b4DFb23C4ade8C88E526C1353AbAcbC38F',
    '0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526',
    '0x309D0B190FeCCa8e1D5D8309a16F7e3CB133E885',
    '0x9641d764fc13c8B624c04430C7356C1C7C8102e2',
    '0x0408EF011960d02349d50286D20531229BCef773',
    '0x218543288004CD07832472D464648173c77D7eB7',
    '0xA83c336B20401Af773B6219BA5027174338D1836'
  ].map((address) => address.toLowerCase())
)
const MULTI_SEND_SELECTOR = '0x8d80ff0a'

/** Splits a delegatecall to an official MultiSend into the calls it makes from the Safe. */
export function unpackMultiSend(
  proposal: Pick<SafeProposal, 'to' | 'operation' | 'data'>
): Omit<SafeAction, 'decoded'>[] | undefined {
  if (
    proposal.operation !== 1 ||
    !MULTI_SEND_ADDRESSES.has(proposal.to.toLowerCase()) ||
    proposal.data.slice(0, 10).toLowerCase() !== MULTI_SEND_SELECTOR
  ) {
    return undefined
  }
  let packed: Uint8Array
  try {
    packed = getBytes(AbiCoder.defaultAbiCoder().decode(['bytes'], dataSlice(proposal.data, 4))[0] as string)
  } catch {
    return undefined
  }
  const actions: Omit<SafeAction, 'decoded'>[] = []
  for (let offset = 0; offset < packed.length;) {
    if (offset + 85 > packed.length || actions.length === MAX_SAFE_BATCH_ACTIONS) {
      return undefined
    }
    const operation = packed[offset]
    const length = toBigInt(packed.subarray(offset + 53, offset + 85))
    const end = offset + 85 + Number(length)
    if ((operation !== 0 && operation !== 1) || length > BigInt(packed.length) || end > packed.length) {
      return undefined
    }
    actions.push({
      operation,
      to: getAddress(dataSlice(packed, offset + 1, offset + 21)),
      value: toBigInt(packed.subarray(offset + 21, offset + 53)).toString(),
      data: dataSlice(packed, offset + 85, end)
    })
    offset = end
  }
  return actions.length ? actions : undefined
}

/** The calls a Safe proposal makes: each batched call, or the proposal itself. */
export function safeProposalActions(proposal: SafeProposal): SafeAction[] {
  return (
    proposal.batch ?? [
      {
        operation: proposal.operation,
        to: proposal.to,
        value: proposal.value,
        data: proposal.data,
        ...(proposal.localDecoded ? { decoded: proposal.localDecoded } : {})
      }
    ]
  )
}
