import { listCuratedTokenAssets } from '../../asset-data/domain/asset/index.js'

import type { CanonicalStoreReader } from '../../../platform/state-store/actions.js'
import type { Token } from '../../../platform/state-store/state/index.js'

export interface BundledTokenService {
  start(): void
}

export function createBundledTokenService(
  canonicalStore: Pick<CanonicalStoreReader, 'getState'>
): BundledTokenService {
  const bundledTokens = (): Token[] =>
    listCuratedTokenAssets().map((asset) => ({
      address: asset.address,
      chainId: asset.chainId,
      decimals: asset.decimals,
      name: asset.name,
      symbol: asset.symbol
    }))

  return {
    start() {
      canonicalStore.getState().upsertTokens(bundledTokens(), { curated: true, source: 'bundled' })
    }
  }
}
