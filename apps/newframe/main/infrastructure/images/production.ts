import log from 'electron-log'

import { downloadImage } from '../../images/download.js'
import type { ImageServiceAdapters } from '../../images/index.js'
import { getTokenDiscoveryProvider } from '../../portfolio/index.js'
import type store from '../../store/index.js'

export function createProductionImageServiceAdapters(
  canonicalStore: Pick<typeof store, 'getState'>
): ImageServiceAdapters {
  return {
    downloadImage,
    getTokenDiscoveryProvider: () => getTokenDiscoveryProvider(canonicalStore),
    log
  }
}
