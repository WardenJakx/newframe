import type { Accounts } from '../../../features/accounts/main/index.ts'
import type { CanonicalStoreReader } from '../../../platform/state-store/actions.ts'
import { internet } from '../../internet/index.ts'
import type { AssetRateService } from '../../services/assets/assetRates/service.ts'
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
