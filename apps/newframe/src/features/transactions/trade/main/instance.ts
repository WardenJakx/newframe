import { internet } from '../../../../core/internet/index.ts'
import type { CanonicalStoreReader } from '../../../../platform/state-store/actions.ts'
import type { Accounts } from '../../../accounts/main/index.ts'
import type { AssetRateService } from '../../../asset-data/main/assetRates/service.ts'
import { createFlashService } from './index.ts'

export function createProductionFlashService(
  canonicalStore: Pick<CanonicalStoreReader, 'getState'>,
  accounts: Accounts,
  assetRateService: AssetRateService
) {
  return createFlashService({
    assetRateService,
    internet,
    store: canonicalStore,
    positionSync: {
      track: ({ address, tokens }) => accounts.trackPositionTokens(address, tokens),
      refresh: ({ address, chainId, tokens }) => accounts.refreshPositions(address, chainId, tokens)
    }
  })
}
