import { z } from 'zod'

export const HexQuantitySchema = z
  .string()
  .max(66)
  .regex(/^0x[0-9a-fA-F]+$/)

export const TransactionApprovalAdjustmentsSchema = z.strictObject({
  gasLimit: HexQuantitySchema.optional(),
  gasPrice: HexQuantitySchema.optional(),
  maxFeePerGas: HexQuantitySchema.optional(),
  maxPriorityFeePerGas: HexQuantitySchema.optional(),
  nonce: HexQuantitySchema.optional()
})

export type TransactionApprovalAdjustments = z.infer<typeof TransactionApprovalAdjustmentsSchema>
