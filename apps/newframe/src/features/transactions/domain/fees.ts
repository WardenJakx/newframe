export type TransactionFeeField = 'baseFee' | 'priorityFee' | 'gasPrice' | 'gasLimit'

export type TransactionFeeValues = {
  gasPrice?: bigint
  baseFee?: bigint
  priorityFee?: bigint
  gasLimit: bigint
}

const ETH_FAMILY_CHAIN_IDS = new Set([1, 3, 4, 5, 6, 10, 42, 61, 62, 63, 69, 8453, 42161, 421611, 7777777])
const FANTOM_CHAIN_IDS = new Set([250, 4002])

export const MAX_FEE_COMPONENT = 9_999_000_000_000n
export const MAX_GAS_LIMIT = 12_500_000n

export function maxTotalTransactionFee(chainId?: string | number) {
  const parsedChainId = Number.parseInt(String(chainId ?? ''))

  if (ETH_FAMILY_CHAIN_IDS.has(parsedChainId)) return 2n * 10n ** 18n
  if (FANTOM_CHAIN_IDS.has(parsedChainId)) return 250n * 10n ** 18n
  return 50n * 10n ** 18n
}

export function totalTransactionFee({
  gasPrice,
  baseFee = 0n,
  priorityFee = 0n,
  gasLimit
}: TransactionFeeValues) {
  return gasPrice !== undefined ? gasPrice * gasLimit : (baseFee + priorityFee) * gasLimit
}

function clamp(value: bigint, maximum: bigint) {
  if (value < 0n) return 0n
  if (value > maximum) return maximum
  return value
}

export function limitTransactionFee(
  field: TransactionFeeField,
  requestedValue: bigint,
  current: TransactionFeeValues,
  chainId?: string | number
) {
  const maximumTotal = maxTotalTransactionFee(chainId)

  if (field === 'gasLimit') {
    let limitedValue = requestedValue
    const pricePerGas =
      current.gasPrice && current.gasPrice > 0n
        ? current.gasPrice
        : (current.baseFee ?? 0n) + (current.priorityFee ?? 0n)

    if (pricePerGas > 0n && pricePerGas * requestedValue > maximumTotal) {
      limitedValue = maximumTotal / pricePerGas
    }

    return clamp(limitedValue, MAX_GAS_LIMIT)
  }

  let limitedValue = requestedValue
  if (field === 'gasPrice') {
    if (current.gasLimit > 0n && requestedValue * current.gasLimit > maximumTotal) {
      limitedValue = maximumTotal / current.gasLimit
    }
  } else {
    const otherFee = field === 'baseFee' ? (current.priorityFee ?? 0n) : (current.baseFee ?? 0n)

    if (current.gasLimit > 0n && (requestedValue + otherFee) * current.gasLimit > maximumTotal) {
      limitedValue = maximumTotal / current.gasLimit - otherFee
    }
  }

  return clamp(limitedValue, MAX_FEE_COMPONENT)
}
