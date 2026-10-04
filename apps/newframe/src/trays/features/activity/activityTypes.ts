import type { WalletRendererState } from '@newframe/schema/projections'
import type { TransactionEffect } from '@newframe/schema/transactions'

import type { ChainLike, ChainMetaLike } from '../../shared/ui/tokenSelectorTypes.ts'

export type WalletActivityRecord = WalletRendererState['activity'][string]

type ActivityData = {
  from?: string
  to?: string
  value?: string
}

type ActivityDisplay = {
  title?: string
  subtitle?: string
}

type ActivityReceipt = {
  blockNumber?: string
}

type ActivityTokenData = {
  address?: string
  decimals?: number
  logoURI?: string
  name?: string
  symbol?: string
}

export type ActivityBalanceChange = Omit<Partial<TransactionEffect>, 'direction' | 'kind'> & {
  direction: string
  kind: string
}

export type ActivityRecord = Partial<
  Omit<WalletActivityRecord, 'balanceChanges' | 'data' | 'display' | 'receipt' | 'status'>
> & {
  id?: string
  balanceChanges?: ActivityBalanceChange[]
  classification?: 'CONTRACT_DEPLOY' | 'CONTRACT_CALL' | 'SEND_DATA' | 'NATIVE_TRANSFER'
  data?: ActivityData
  display?: ActivityDisplay
  receipt?: ActivityReceipt
  tokenData?: ActivityTokenData
  status?: string
}

export type ActivityChainMap = Record<
  string | number,
  ChainLike & { explorer?: string; isTestnet?: boolean; symbol?: string }
>
export type ActivityChainMetadataMap = Record<string | number, ChainMetaLike>
export type ActivityDetailChainMetadata = WalletRendererState['chainsMeta']['ethereum'][number]
export type ActivityTokenCatalog = WalletRendererState['tokens']
export type ActivityViewRecord = ActivityRecord & { id: string }

const recordValue = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : undefined

export function projectActivityRecord(record: WalletActivityRecord | ActivityRecord): ActivityRecord {
  const data = recordValue(record.data)
  const display = recordValue(record.display)
  const receipt = recordValue(record.receipt)
  return {
    ...record,
    balanceChanges: record.balanceChanges,
    data: data
      ? {
          from: typeof data.from === 'string' ? data.from : undefined,
          to: typeof data.to === 'string' ? data.to : undefined,
          value: typeof data.value === 'string' ? data.value : undefined
        }
      : undefined,
    display: display
      ? {
          title: typeof display.title === 'string' ? display.title : undefined,
          subtitle: typeof display.subtitle === 'string' ? display.subtitle : undefined
        }
      : undefined,
    receipt: receipt
      ? { blockNumber: typeof receipt.blockNumber === 'string' ? receipt.blockNumber : undefined }
      : undefined
  }
}
