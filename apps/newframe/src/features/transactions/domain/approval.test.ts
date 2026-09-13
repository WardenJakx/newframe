import { expect, it } from 'bun:test'

import { applyTransactionAdjustments, TransactionApprovalAdjustmentsSchema } from './approval'
import { MAX_FEE_COMPONENT } from './fees'
import { GasFeesSource, type TransactionData } from './index'

const canonical: TransactionData = {
  chainId: '0x1',
  type: '0x0',
  gasFeesSource: GasFeesSource.Dapp,
  from: '0xabc',
  to: '0xdef',
  data: '0x1234',
  value: '0x7',
  gasLimit: '0x5208',
  gasPrice: '0x3b9aca00'
}
const hex = (value: bigint) => `0x${value.toString(16)}`

it('applies only explicit values to a fresh candidate while preserving intent and omitted nonce', () => {
  const candidate = applyTransactionAdjustments(canonical, { gasPrice: '0x1' })
  expect(candidate).toEqual({ ...canonical, gasPrice: '0x1' })
  expect(candidate).not.toBe(canonical)
  expect(candidate.nonce).toBeUndefined()
  expect(applyTransactionAdjustments(canonical, { nonce: '0x0' }).nonce).toBe('0x0')
  expect(canonical.gasPrice).toBe('0x3b9aca00')
})

it.each([
  { to: '0xabc' },
  { nonce: '-0x1' },
  { gasLimit: '10' },
  { value: '0x1' },
  { data: '0x' },
  { nonce: `0x${'f'.repeat(65)}` }
])('rejects malformed and forbidden adjustments %j', (input) => {
  expect(TransactionApprovalAdjustmentsSchema.safeParse(input).success).toBeFalse()
})

it('rejects incompatible and over-budget candidates before changing canonical values', () => {
  const snapshot = structuredClone(canonical)
  for (const input of [
    { maxFeePerGas: '0x1' },
    { gasLimit: hex(12_500_001n) },
    { gasPrice: hex(MAX_FEE_COMPONENT + 1n) },
    { gasPrice: hex(400_000_000_000n), gasLimit: hex(5_000_001n) }
  ]) {
    expect(() => applyTransactionAdjustments(canonical, input)).toThrow()
    expect(canonical).toEqual(snapshot)
  }
})

it('validates EIP-1559 components separately, preserving their combined maximum', () => {
  const tx = {
    ...canonical,
    type: '0x2',
    gasPrice: undefined,
    gasLimit: '0x1',
    maxFeePerGas: '0x4',
    maxPriorityFeePerGas: '0x1'
  }
  expect(
    applyTransactionAdjustments(tx, {
      maxFeePerGas: hex(MAX_FEE_COMPONENT * 2n),
      maxPriorityFeePerGas: hex(MAX_FEE_COMPONENT)
    }).maxFeePerGas
  ).toBe(hex(MAX_FEE_COMPONENT * 2n))
  expect(() => applyTransactionAdjustments(tx, { maxPriorityFeePerGas: '0x5' })).toThrow()
  expect(() => applyTransactionAdjustments(tx, { gasPrice: '0x1' })).toThrow()
  expect(() => applyTransactionAdjustments(tx, { maxFeePerGas: hex(MAX_FEE_COMPONENT + 2n) })).toThrow()
})
