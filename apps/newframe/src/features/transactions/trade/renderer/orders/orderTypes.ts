import type { WalletRendererState } from '../../../../../platform/state-sync/contract/projections'
import type { NetworkLike, NetworkMetaLike } from '../../../../../shared/renderer/ui/tokenSelectorTypes'

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
export type OrderNetworkMap = Record<string | number, NetworkLike & { isTestnet?: boolean }>
export type OrderNetworkMetadataMap = Record<string | number, NetworkMetaLike>
export type OrderTokenCatalog = WalletRendererState['tokens']
