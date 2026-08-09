import type {
  SideTrayOpenCommand,
  UpdaterRespondCommand,
  WarningToggleCommand
} from '../../contracts/operations.js'
import {
  buildSideTrayRoute,
  normalizeSideTrayFrameRequest,
  SIDE_TRAY_FRAME_ID
} from '../../contracts/sidetray/index.js'
import type { CanonicalStore } from '../../../platform/state-store/actions.js'

type PlatformState = Pick<
  CanonicalStore,
  | 'clearHomeCommand'
  | 'dismissNotification'
  | 'dontRemind'
  | 'expireNotification'
  | 'main'
  | 'navBack'
  | 'navForward'
  | 'notify'
  | 'setSideTray'
  | 'toggleExplorerWarning'
  | 'toggleGasFeeWarning'
  | 'toggleSignerCompatibilityWarning'
  | 'tray'
  | 'trustExtension'
  | 'updateBadge'
  | 'view'
>

type RendererEvent = Pick<Electron.IpcMainInvokeEvent, 'sender'>

export interface PlatformServicePorts {
  accounts: {
    current():
      | {
          address: string
          getRequest(requestId: string): { type: string } | undefined
        }
      | null
      | undefined
  }
  app: Pick<Electron.App, 'quit'>
  clipboard: Pick<Electron.Clipboard, 'writeText'>
  openBlockExplorer(chain: { id: number; type: 'ethereum' }, transactionHash?: string): void
  openExternal(url: string): void
  store: { getState(): PlatformState }
  updater: {
    dismissUpdate(): void
    fetchUpdate(): void
    quitAndInstall(): void
    updateReady: boolean
  }
  windows: {
    close(event: RendererEvent): void
    handleTrayMouseout(): void
    inspect(event: RendererEvent, x: number, y: number): void
    refocusSideTray(frameId: string): void
  }
}

export function createPlatformService(ports: PlatformServicePorts) {
  return {
    closeSideTray(event: RendererEvent) {
      ports.windows.close(event)
    },

    consumeHomeCommand(commandId: number) {
      const state = ports.store.getState()
      const command = state.tray.homeCommand as { id: number } | null
      if (!command || command.id !== commandId) return false
      state.clearHomeCommand(commandId)
      return true
    },

    inspectRenderer(event: RendererEvent, x: number, y: number) {
      ports.windows.inspect(event, x, y)
    },

    navigatePanelBack(steps: number) {
      ports.store.getState().navBack('panel', steps)
    },

    openExternal(url: string) {
      ports.openExternal(url)
    },

    openRequestPanel(requestId: string) {
      const account = ports.accounts.current()
      const request = account?.getRequest(requestId)
      if (!account || !request) return false

      ports.store.getState().navForward('panel', {
        view: 'requestView',
        data: { step: 'confirm', accountId: account.address, requestId },
        position: { bottom: request.type === 'transaction' ? '200px' : '140px' }
      })
      return true
    },

    openSideTray(command: SideTrayOpenCommand) {
      const state = ports.store.getState()
      if (command.chainId && !state.main.networks.ethereum[command.chainId]) return false

      const frame = normalizeSideTrayFrameRequest({
        id: SIDE_TRAY_FRAME_ID,
        route: buildSideTrayRoute(
          command.feature,
          command.assetId || '',
          command.feature === 'trade' ? command.chainId : undefined
        )
      })!
      const exists = state.main.frames[frame.id]
      state.setSideTray(frame)
      if (exists) ports.windows.refocusSideTray(frame.id)
      return true
    },

    openTransactionExplorer(chainId: number, transactionHash?: string) {
      const chain = ports.store.getState().main.networks.ethereum[chainId]
      if (!chain) return false
      ports.openBlockExplorer({ id: chainId, type: 'ethereum' }, transactionHash)
      return true
    },

    quitApp() {
      ports.app.quit()
    },

    respondToExtension(extensionId: string, approved: boolean) {
      const state = ports.store.getState()
      const pending = state.view.notifyData as { id?: string }
      if (state.view.notify !== 'extensionConnect' || pending?.id !== extensionId) return false

      state.trustExtension(extensionId, approved)
      state.notify('', {})
      return true
    },

    respondToUpdater(action: UpdaterRespondCommand['action']) {
      const state = ports.store.getState()
      const badge = state.view.badge as { type?: string; version?: string }

      if (action === 'restart') {
        if (badge.type !== 'updateReady' || !ports.updater.updateReady) return false
        state.updateBadge('', undefined)
        ports.updater.quitAndInstall()
        return true
      }

      if (action === 'dismiss-ready') {
        if (badge.type !== 'updateReady') return false
        state.updateBadge('', undefined)
        return true
      }

      if (badge.type !== 'updateAvailable') return false
      state.updateBadge('', undefined)
      if (action === 'install') ports.updater.fetchUpdate()
      else {
        if (action === 'skip' && badge.version) state.dontRemind(badge.version)
        ports.updater.dismissUpdate()
      }
      return true
    },

    toggleWarning(warning: WarningToggleCommand['warning']) {
      const state = ports.store.getState()
      const actions = {
        explorer: state.toggleExplorerWarning,
        'gas-fee': state.toggleGasFeeWarning,
        'signer-compatibility': state.toggleSignerCompatibilityWarning
      }
      actions[warning]()
    },

    updateNotification(notificationId: string, action: 'dismiss' | 'expire') {
      const state = ports.store.getState()
      if (!state.view.notifications[notificationId]) return false
      if (action === 'dismiss') state.dismissNotification(notificationId)
      else state.expireNotification(notificationId)
      return true
    },

    writeClipboard(text: string) {
      ports.clipboard.writeText(text)
    },

    handleTrayMouseout() {
      ports.windows.handleTrayMouseout()
    }
  }
}

export type PlatformService = ReturnType<typeof createPlatformService>
