import accounts from '../accounts'
import { createFlashService } from './index'

export const flashService = createFlashService({
  positionSync: {
    track: ({ address, tokens }) => accounts.trackPositionTokens(address as Address, tokens),
    refresh: ({ address, chainId, tokens }) => accounts.refreshPositions(address as Address, chainId, tokens)
  }
})
