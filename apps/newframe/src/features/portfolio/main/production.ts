import log from 'electron-log'

import type store from '../../../platform/state-store/index.js'
import { getTokenDiscoveryProvider } from './index.js'
import type { PortfolioServiceAdapters } from './service.js'

export function createProductionPortfolioAdapters(
  canonicalStore: Pick<typeof store, 'getState'>
): PortfolioServiceAdapters {
  return {
    getTokenDiscoveryProvider: () => getTokenDiscoveryProvider(canonicalStore),
    log
  }
}
