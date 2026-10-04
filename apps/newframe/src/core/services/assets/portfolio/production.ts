import log from 'electron-log'

import type store from '../../../state/store/index.ts'
import { getTokenDiscoveryProvider } from './index.ts'
import type { PortfolioServiceAdapters } from './service.ts'

export function createProductionPortfolioAdapters(
  canonicalStore: Pick<typeof store, 'getState'>
): PortfolioServiceAdapters {
  return {
    getTokenDiscoveryProvider: () => getTokenDiscoveryProvider(canonicalStore),
    log
  }
}
