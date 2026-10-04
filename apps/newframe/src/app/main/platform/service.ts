import type { CanonicalStore } from '../../../platform/state-store/actions.ts'
import type {
  SideTrayOpenCommand,
  UpdaterRespondCommand,
  WarningToggleCommand
} from '../../contracts/operations.ts'
import {
  buildSideTrayRoute,
  normalizeSideTrayFrameRequest,
  SIDE_TRAY_FRAME_ID
} from '../../contracts/side-tray/index.ts'

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
  | 'setExtensionAccess'
  | 'updateBadge'
  | 'view'
>

type TrayEvent = Pick<Electron.IpcMainInvokeEvent, 'sender'>

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
  app: Pick<Electron.App, 'quit' | 'relaunch'>
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
    close(event: TrayEvent): void
    handleTrayMouseout(): void
    inspect(event: TrayEvent, x: number, y: number): void
    refocusSideTray(frameId: string): void
  }
}

export function createPlatformService(ports: PlatformServicePorts) {
  return {
    closeSideTray(event: TrayEvent) {
      ports.windows.close(event)
    },

    consumeHomeCommand(commandId: number) {
      const state = ports.store.getState()
      const command = state.tray.homeCommand as { id: number } | null
      if (!command || command.id !== commandId) {
        return false
      }
      state.clearHomeCommand(commandId)
      return true
    },

    inspectTray(event: TrayEvent, x: number, y: number) {
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
      if (!account || !request) {
        return false
      }

      ports.store.getState().navForward('panel', {
        view: 'requestView',
        data: { step: 'confirm', accountId: account.address, requestId },
        position: { bottom: request.type === 'transaction' ? '200px' : '140px' }
      })
      return true
    },

    openSideTray(command: SideTrayOpenCommand) {
      const state = ports.store.getState()
      const chains = state.main.chains.ethereum as Record<
        number,
        (typeof state.main.chains.ethereum)[number] | undefined
      >
      if (command.chainId && !chains[command.chainId]) {
        return false
      }

      const frame = normalizeSideTrayFrameRequest({
        id: SIDE_TRAY_FRAME_ID,
        route: buildSideTrayRoute(
          command.feature,
          command.assetId ?? '',
          command.feature === 'trade' ? command.chainId : undefined
        )
      })!
      const frames = state.main.frames as Record<string, (typeof state.main.frames)[string] | undefined>
      const exists = frames[frame.id]
      state.setSideTray(frame)
      if (exists) {
        ports.windows.refocusSideTray(frame.id)
      }
      return true
    },

    openTransactionExplorer(chainId: number, transactionHash?: string) {
      const state = ports.store.getState()
      const chains = state.main.chains.ethereum as Record<
        number,
        (typeof state.main.chains.ethereum)[number] | undefined
      >
      const chain = chains[chainId]
      if (!chain) {
        return false
      }
      ports.openBlockExplorer({ id: chainId, type: 'ethereum' }, transactionHash)
      return true
    },

    quitApp() {
      ports.app.quit()
    },

    restartApp() {
      ports.app.relaunch()
      ports.app.quit()
    },

    respondToExtension(extensionId: string, approved: boolean) {
      const state = ports.store.getState()
      const pending = state.view.notifyData as { id?: string }
      if (state.view.notify !== 'extensionConnect' || pending.id !== extensionId) {
        return false
      }

      state.trustExtension(extensionId, approved)
      // An approved extension sees no accounts until the human chooses some.
      state.notify(approved ? 'extensionAccess' : '', approved ? { id: extensionId } : {})
      return true
    },

    /** The extension must ask to connect again, and its account access is cleared. */
    forgetExtension(extensionId: string) {
      const state = ports.store.getState()
      if (!Object.hasOwn(state.main.knownExtensions, extensionId)) {
        return false
      }
      state.trustExtension(extensionId, undefined)
      return true
    },

    openExtensionAccess(extensionId: string) {
      const state = ports.store.getState()
      if (state.main.knownExtensions[extensionId] !== true) {
        return false
      }
      state.notify('extensionAccess', { id: extensionId })
      return true
    },

    respondToExtensionAccess(extensionId: string, grant?: { all: boolean; accountIds: string[] }) {
      const state = ports.store.getState()
      const pending = state.view.notifyData as { id?: string }
      if (state.view.notify !== 'extensionAccess' || pending.id !== extensionId) {
        return false
      }

      if (grant) {
        state.setExtensionAccess(extensionId, grant.all, grant.accountIds)
      }
      state.notify('', {})
      return true
    },

    respondToUpdater(action: UpdaterRespondCommand['action']) {
      const state = ports.store.getState()
      const badge = state.view.badge as { type?: string; version?: string }

      if (action === 'restart') {
        if (badge.type !== 'updateReady' || !ports.updater.updateReady) {
          return false
        }
        state.updateBadge('', undefined)
        ports.updater.quitAndInstall()
        return true
      }

      if (action === 'dismiss-ready') {
        if (badge.type !== 'updateReady') {
          return false
        }
        state.updateBadge('', undefined)
        return true
      }

      if (badge.type !== 'updateAvailable') {
        return false
      }
      state.updateBadge('', undefined)
      if (action === 'install') {
        ports.updater.fetchUpdate()
      } else {
        if (action === 'skip' && badge.version) {
          state.dontRemind(badge.version)
        }
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
      const notifications = state.view.notifications as Record<
        string,
        (typeof state.view.notifications)[string] | undefined
      >
      if (!notifications[notificationId]) {
        return false
      }
      if (action === 'dismiss') {
        state.dismissNotification(notificationId)
      } else {
        state.expireNotification(notificationId)
      }
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
