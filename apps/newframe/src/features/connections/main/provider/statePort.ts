import type { CanonicalStoreReader } from '../../../../platform/state-store/actions.ts'
import type { Address } from '../../../../shared/domain/address.ts'
import type { RPC } from '../../../../shared/domain/rpc.ts'
import { createObserver as createAssetsObserver, loadAssets } from './assets.ts'
import { createChainsObserver, createOriginChainObserver, getActiveChains } from './chains.ts'

type ChainsHandler = Parameters<typeof createChainsObserver>[1]
type OriginHandler = Parameters<typeof createOriginChainObserver>[1]
type AssetsHandler = Parameters<typeof createAssetsObserver>[1]
type CanonicalStoreApi = CanonicalStoreReader

export interface ProviderStatePort {
  createAssetsObserver(handler: AssetsHandler): () => void
  createChainsObserver(handler: ChainsHandler): () => void
  createOriginChainObserver(handler: OriginHandler): () => void
  getActiveChains(): RPC.GetEthereumChains.Chain[]
  loadAssets(accountId: string): RPC.GetAssets.Assets
}

export function createProviderStatePort(
  store: CanonicalStoreApi,
  balances: { refreshBalances(address: Address): void }
): ProviderStatePort {
  return {
    createAssetsObserver: (handler) => createAssetsObserver(store, handler),
    createChainsObserver: (handler) => createChainsObserver(store, handler),
    createOriginChainObserver: (handler) => createOriginChainObserver(store, handler),
    getActiveChains: () => getActiveChains(store),
    loadAssets: (accountId) => loadAssets(store, accountId, (address) => balances.refreshBalances(address))
  }
}
