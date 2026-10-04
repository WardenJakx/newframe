import type { WalletRendererState } from '../../../../../platform/state-sync/contract/projections.ts'
import type { ChainLike, ChainMetaLike } from '../../../../../shared/renderer/ui/tokenSelectorTypes.ts'

type OrderRecord = WalletRendererState['orders'][string]
export type OrderAsset = Partial<OrderRecord['targetAsset']> & {
  assetSymbol?: string
  icon?: string
  logoURI?: string
  logoUrl?: string
  ticker?: string
}
export type OrderModel = Partial<
  Omit<OrderRecord, 'contraAsset' | 'receiveAsset' | 'spentAsset' | 'targetAsset'>
> & {
  contraAsset?: OrderAsset
  receiveAsset?: OrderAsset
  spentAsset?: OrderAsset
  targetAsset?: OrderAsset
}
export type OrderRow = OrderModel & { orderId: string }
export type OrderChainMap = Record<string | number, ChainLike & { isTestnet?: boolean }>
export type OrderChainMetadataMap = Record<string | number, ChainMetaLike>
export type OrderTokenCatalog = WalletRendererState['tokens']
