import { JSONTx } from '@ethereumjs/tx'
import { addHexPrefix, isHexString } from '@ethereumjs/util'

export enum GasFeesSource {
  Dapp = 'Dapp',
  Frame = 'Frame'
}

// ethereumjs v10 types JSONTx fields as `0x${string}` templates; Frame passes
// plain (but 0x-prefixed at runtime) strings throughout, so widen them here and
// narrow again at the createTx boundary
type WidenHexFields<T> = {
  [K in keyof T]: NonNullable<T[K]> extends `0x${string}`
    ? undefined extends T[K]
      ? string | undefined
      : string
    : T[K]
}

export interface TransactionData extends Omit<WidenHexFields<JSONTx>, 'chainId' | 'type'> {
  warning?: string
  gas?: string
  from?: string
  feesUpdated?: boolean
  chainId: string
  type: string
  gasFeesSource: GasFeesSource
  recipientType?: string
}

export function typeSupportsBaseFee(type: string) {
  return parseInt(type || '0') === 2
}

export function usesBaseFee(rawTx: TransactionData) {
  return typeSupportsBaseFee(rawTx.type)
}

function parseChainId(chainId: string) {
  if (isHexString(chainId)) {
    return parseInt(chainId, 16)
  }

  return Number(chainId)
}

// TODO: move this into requests parsing module
export function normalizeChainId(tx: RPC.SendTransaction.TxParams, targetChain?: number) {
  if (!tx.chainId) return tx

  const chainId = parseChainId(tx.chainId)

  if (!chainId) {
    throw new Error(`Chain for transaction (${tx.chainId}) is not a hex-prefixed string`)
  }

  if (targetChain && targetChain !== chainId) {
    throw new Error(
      `Chain for transaction (${tx.chainId}) does not match request target chain (${targetChain})`
    )
  }

  return {
    ...tx,
    chainId: addHexPrefix(chainId.toString(16))
  }
}
