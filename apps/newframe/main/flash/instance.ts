import type { Accounts } from '../accounts'
import type { CanonicalStoreReader } from '../store/actions'
import { createFlashService } from './index'

export function createProductionFlashService(
  canonicalStore: Pick<CanonicalStoreReader, 'getState'>,
  accounts: Accounts
) {
  return createFlashService({
    store: canonicalStore,
    positionSync: {
      track: ({ address, tokens }) => accounts.trackPositionTokens(address as Address, tokens),
      refresh: ({ address, chainId, tokens }) =>
        accounts.refreshPositions(address as Address, chainId, tokens)
    }
  })
}
