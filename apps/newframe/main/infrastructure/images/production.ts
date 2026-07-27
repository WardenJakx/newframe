import log from 'electron-log'

import { downloadImage } from '../../images/download'
import type { ImageServiceAdapters } from '../../images'
import { getTokenDiscoveryProvider } from '../../portfolio'
import type store from '../../store'

export function createProductionImageServiceAdapters(
  canonicalStore: Pick<typeof store, 'getState'>
): ImageServiceAdapters {
  return {
    downloadImage,
    getTokenDiscoveryProvider: () => getTokenDiscoveryProvider(canonicalStore),
    log
  }
}
