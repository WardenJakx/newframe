import type store from '../../../platform/state-store/index.js'
import { createBlockExplorerOpener, openExternal } from '../../../platform/desktop/windows/window.js'
import type { PlatformServicePorts } from './service.js'

export type ProductionPlatformExternalAdapters = Pick<
  PlatformServicePorts,
  'app' | 'clipboard' | 'updater'
> & {
  windows: Pick<PlatformServicePorts['windows'], 'handleTrayMouseout' | 'refocusSideTray'> & {
    close(event: Pick<Electron.IpcMainInvokeEvent, 'sender'>): void
  }
}

export function createProductionPlatformAdapters(
  canonicalStore: Pick<typeof store, 'getState'>,
  external: ProductionPlatformExternalAdapters
): Omit<PlatformServicePorts, 'accounts' | 'store'> {
  return {
    app: external.app,
    clipboard: external.clipboard,
    openBlockExplorer: createBlockExplorerOpener(canonicalStore),
    openExternal,
    updater: external.updater,
    windows: {
      close: external.windows.close,
      handleTrayMouseout: external.windows.handleTrayMouseout,
      inspect: (event, x, y) => {
        if (process.env.NODE_ENV === 'development') event.sender.inspectElement(x, y)
      },
      refocusSideTray: external.windows.refocusSideTray
    }
  }
}
