import {
  HexQuantitySchema,
  TransactionApprovalAdjustmentsSchema,
  type TransactionApprovalAdjustments
} from '@newframe/schema/transaction-approval'

import { MAX_FEE_COMPONENT, MAX_GAS_LIMIT, maxTotalTransactionFee, typeSupportsBaseFee } from './fees.ts'

export function applyTransactionAdjustments<
  T extends TransactionApprovalAdjustments & { chainId: string; type: string }
>(canonical: T, input: TransactionApprovalAdjustments) {
  const adjustments = TransactionApprovalAdjustmentsSchema.parse(input)
  const baseFee = typeSupportsBaseFee(canonical.type)
  if (
    baseFee
      ? adjustments.gasPrice !== undefined
      : adjustments.maxFeePerGas !== undefined || adjustments.maxPriorityFeePerGas !== undefined
  ) {
    throw new Error('Adjustments do not match the transaction fee model')
  }
  const candidate: TransactionApprovalAdjustments = { ...canonical }
  for (const field of Object.keys(adjustments) as Array<keyof TransactionApprovalAdjustments>) {
    if (adjustments[field] !== undefined) {
      candidate[field] = adjustments[field]
    }
  }
  const quantity = (value?: string) => BigInt(HexQuantitySchema.parse(value ?? '0x0'))
  const gas = quantity(candidate.gasLimit)
  const priority = baseFee ? quantity(candidate.maxPriorityFeePerGas) : 0n
  const price = quantity(baseFee ? candidate.maxFeePerGas : candidate.gasPrice)
  if (
    gas > MAX_GAS_LIMIT ||
    priority > price ||
    priority > MAX_FEE_COMPONENT ||
    price - priority > MAX_FEE_COMPONENT ||
    gas * price > maxTotalTransactionFee(canonical.chainId)
  ) {
    throw new Error('Transaction adjustments exceed fee limits')
  }
  return { ...canonical, ...candidate }
}
