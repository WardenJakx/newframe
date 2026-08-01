import log from 'electron-log'

import type { PortfolioServiceAdapters } from '../../features/portfolio/service.js'
import { getTokenDiscoveryProvider } from '../../portfolio/index.js'
import type store from '../../store/index.js'

export function createProductionPortfolioAdapters(
  canonicalStore: Pick<typeof store, 'getState'>
): PortfolioServiceAdapters {
  return {
    getTokenDiscoveryProvider: () => getTokenDiscoveryProvider(canonicalStore),
    log
  }
}
