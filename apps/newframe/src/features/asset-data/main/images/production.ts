import log from 'electron-log'

import type store from '../../../../platform/state-store/index.js'
import { getTokenDiscoveryProvider } from '../../../portfolio/main/index.js'
import { downloadImage } from './download.js'
import type { ImageServiceAdapters } from './index.js'

export function createProductionImageServiceAdapters(
  canonicalStore: Pick<typeof store, 'getState'>
): ImageServiceAdapters {
  return {
    downloadImage,
    getTokenDiscoveryProvider: () => getTokenDiscoveryProvider(canonicalStore),
    log
  }
}
