import type { JSONTx } from '@ethereumjs/tx'

export enum GasFeesSource {
  Dapp = 'Dapp',
  Frame = 'Frame'
}

// ethereumjs v10 types JSONTx fields as `0x${string}` templates; Newframe passes
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
  calldataDigest?: string
  chainId: string
  type: string
  gasFeesSource: GasFeesSource
  recipientType?: string
}

type TransactionEffectDirection = 'out' | 'in' | 'neutral'
type TransactionEffectKind = 'native' | 'erc20' | 'allowance'

export interface TransactionEffect {
  id: string
  kind: TransactionEffectKind
  direction: TransactionEffectDirection
  label: string
  amount?: string
  decimals?: number
  symbol: string
  detail?: string
  assetAddress?: string
  spenderAddress?: string
  logoURI?: string
}

export interface TransactionPositionToken {
  address: string
  chainId: number
  decimals: number
  logoURI?: string
  name: string
  symbol: string
}

type TransactionSimulationStatus = 'loading' | 'success' | 'unavailable' | 'error'

export interface TransactionSimulation {
  status: TransactionSimulationStatus
  effects?: TransactionEffect[]
  effectsByAccount?: Record<string, TransactionEffect[]>
  effectsProfileId?: string
  source?: string
  error?: string
  updatedAt?: number
}

export interface TransactionIntent {
  title: string
  subtitle: string
}
