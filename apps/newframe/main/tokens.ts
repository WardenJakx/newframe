import { getFlashAssetsForChain } from '../domain/flash/assets'

import type { CanonicalStoreReader } from './store/actions'
import type { Token } from './store/state'

export interface BundledTokenService {
  start(): void
}

export function createBundledTokenService(
  canonicalStore: Pick<CanonicalStoreReader, 'getState'>
): BundledTokenService {
  const bundledTokens = (): Token[] => {
    const networks = Object.values(canonicalStore.getState().main.networks.ethereum)
    return networks.flatMap((network) =>
      getFlashAssetsForChain(network.id)
        .filter((asset) => !asset.isNative)
        .map((asset) => ({
          address: asset.address,
          chainId: asset.chainId,
          decimals: asset.decimals,
          name: asset.name,
          symbol: asset.symbol
        }))
    )
  }

  return {
    start() {
      canonicalStore.getState().upsertTokens(bundledTokens(), { curated: true, source: 'bundled' })
    }
  }
}
