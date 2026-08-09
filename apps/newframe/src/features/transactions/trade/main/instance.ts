import type { Accounts } from '../../../accounts/main/index.js'
import type { AssetRateService } from '../../../asset-data/main/assetRates/service.js'
import type { CanonicalStoreReader } from '../../../../platform/state-store/actions.js'
import { createFlashService } from './index.js'

export function createProductionFlashService(
  canonicalStore: Pick<CanonicalStoreReader, 'getState'>,
  accounts: Accounts,
  assetRateService: AssetRateService
) {
  return createFlashService({
    assetRateService,
    store: canonicalStore,
    positionSync: {
      track: ({ address, tokens }) => accounts.trackPositionTokens(address as Address, tokens),
      refresh: ({ address, chainId, tokens }) =>
        accounts.refreshPositions(address as Address, chainId, tokens)
    }
  })
}
