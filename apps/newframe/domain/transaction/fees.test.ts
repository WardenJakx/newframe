import { describe, expect, it } from 'bun:test'

import {
  MAX_FEE_COMPONENT,
  MAX_GAS_LIMIT,
  limitTransactionFee,
  maxTotalTransactionFee,
  totalTransactionFee,
  type TransactionFeeValues
} from './fees'

const GWEI = 10n ** 9n
const ETH = 10n ** 18n

describe('transaction fee policy', () => {
  it('assigns the maximum total fee by chain family', () => {
    const cases: Array<[string | number | undefined, bigint]> = [
      ['0x1', 2n * ETH],
      [8453, 2n * ETH],
      ['0xfa', 250n * ETH],
      [4002, 250n * ETH],
      [137, 50n * ETH],
      [undefined, 50n * ETH]
    ]

    for (const [chainId, expected] of cases) {
      expect(maxTotalTransactionFee(chainId)).toBe(expected)
    }
  })

  it('calculates legacy and EIP-1559 totals from their respective price models', () => {
    expect(totalTransactionFee({ gasPrice: 7n, gasLimit: 25_000n })).toBe(175_000n)
    expect(totalTransactionFee({ baseFee: 4n, priorityFee: 3n, gasLimit: 25_000n })).toBe(175_000n)
  })

  it('clamps fee components to their absolute safe range', () => {
    const current = { gasLimit: 1n }

    expect(limitTransactionFee('baseFee', -1n, current)).toBe(0n)
    expect(limitTransactionFee('priorityFee', MAX_FEE_COMPONENT + 1n, current)).toBe(MAX_FEE_COMPONENT)
    expect(limitTransactionFee('gasPrice', MAX_FEE_COMPONENT + 1n, current)).toBe(MAX_FEE_COMPONENT)
  })

  it('caps EIP-1559 components at the chain budget while preserving the other component', () => {
    const current: TransactionFeeValues = {
      baseFee: 300n * GWEI,
      priorityFee: 300n * GWEI,
      gasLimit: 250_000n
    }

    expect(limitTransactionFee('baseFee', 7_800n * GWEI, current, 1)).toBe(7_700n * GWEI)
    expect(limitTransactionFee('priorityFee', 7_800n * GWEI, current, 1)).toBe(7_700n * GWEI)
    expect(limitTransactionFee('baseFee', 49_800n * GWEI, current, 137)).toBe(MAX_FEE_COMPONENT)
  })

  it('caps legacy gas price at the chain budget', () => {
    const current = { gasPrice: 600n * GWEI, gasLimit: 250_000n }

    expect(limitTransactionFee('gasPrice', 8_100n * GWEI, current, '0x1')).toBe(8_000n * GWEI)
    expect(limitTransactionFee('gasPrice', 1_000n * GWEI, current, '0xfa')).toBe(1_000n * GWEI)
  })

  it('caps gas units by total budget and the absolute gas limit', () => {
    const cases: Array<[TransactionFeeValues, bigint, string | number, bigint]> = [
      [{ gasPrice: 1_000n * GWEI, gasLimit: 25_000n }, 3_000_000n, 1, 2_000_000n],
      [{ baseFee: 600n * GWEI, priorityFee: 400n * GWEI, gasLimit: 25_000n }, 3_000_000n, 1, 2_000_000n],
      [{ gasPrice: 1n, gasLimit: 25_000n }, MAX_GAS_LIMIT + 1n, 1, MAX_GAS_LIMIT]
    ]

    for (const [current, requested, chainId, expected] of cases) {
      expect(limitTransactionFee('gasLimit', requested, current, chainId)).toBe(expected)
    }
  })
})
