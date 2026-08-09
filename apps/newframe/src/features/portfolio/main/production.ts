import log from 'electron-log'

import type { PortfolioServiceAdapters } from './service.js'
import { getTokenDiscoveryProvider } from './index.js'
import type store from '../../../platform/state-store/index.js'

export function createProductionPortfolioAdapters(
  canonicalStore: Pick<typeof store, 'getState'>
): PortfolioServiceAdapters {
  return {
    getTokenDiscoveryProvider: () => getTokenDiscoveryProvider(canonicalStore),
    log
  }
}
