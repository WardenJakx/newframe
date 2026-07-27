import { app, clipboard, ipcMain, net, protocol, powerMonitor } from 'electron'
import path from 'path'
import log from 'electron-log'
import url from 'url'

import windows from './windows/index.js'
import menu from './menu.js'
import store, { createCanonicalPersistenceService } from './store/index.js'
import persist from './store/persist/index.js'
import { createBundledTokenService } from './tokens.js'
import * as launch from './launch.js'
import { Updater } from './updater/index.js'
import { Signers } from './signers/index.js'
import TrezorBridge from './signers/trezor/bridge.js'
import biometrics from './biometrics.js'
import vault from './vault.js'
import { showUnhandledExceptionDialog } from './windows/dialog.js'
import { getErrorCode } from './runtime/errors.js'
import { createProductionCapabilities, createProductionMainApp } from './composition/index.js'
import { createProductionPersistencePorts } from './infrastructure/persistence/index.js'
import { createProductionAccountsRuntime } from './infrastructure/accounts/production.js'
import { createProductionImageServiceAdapters } from './infrastructure/images/production.js'
import { createProductionSideTrayWindowCapability } from './infrastructure/sideTrayWorkflows/production.js'
import { createProductionWalletWorkflowAdapters } from './infrastructure/walletWorkflows/production.js'
import { createProductionApiServer } from './api/index.js'

const signers = new Signers({ biometrics, store, vault })
const updater = new Updater(store)
const bundledTokens = createBundledTokenService(store)

app.commandLine.appendSwitch('enable-accelerated-2d-canvas', 'true')
app.commandLine.appendSwitch('enable-gpu-rasterization', 'true')
app.commandLine.appendSwitch('force-gpu-rasterization', 'true')
app.commandLine.appendSwitch('ignore-gpu-blacklist', 'true')
app.commandLine.appendSwitch('enable-native-gpu-memory-buffers', 'true')
app.commandLine.appendSwitch('force-color-profile', 'srgb')

const isDev = process.env.NODE_ENV === 'development'
log.transports.console.level = process.env.LOG_LEVEL || (isDev ? 'verbose' : 'info')

if (process.env.LOG_LEVEL === 'debug') {
  log.transports.file.level = 'debug'
  log.transports.file.resolvePathFn = () => path.join(app.getPath('userData'), 'logs/debug.log')
} else {
  log.transports.file.level = ['development', 'test'].includes(process.env.NODE_ENV) ? false : 'verbose'
}

const hasInstanceLock = app.requestSingleInstanceLock()

if (!hasInstanceLock) {
  log.info('another instance of Newframe is running - exiting...')
  app.exit(1)
}

const persistence = createCanonicalPersistenceService(
  createProductionPersistencePorts(app.getPath('userData'))
)
const {
  accountCapabilities,
  accounts,
  agentService,
  chains,
  flashService,
  imageService,
  nameResolution,
  provider,
  proxy,
  rendererAuthorization,
  sideTrayTransactions,
  sideTrayWorkflows,
  walletWorkflows
} = createProductionCapabilities(store, {
  accounts: createProductionAccountsRuntime(store, { persistence: persist, signers, windows }),
  images: createProductionImageServiceAdapters(store),
  sideTrayWindows: createProductionSideTrayWindowCapability(),
  walletWorkflows: createProductionWalletWorkflowAdapters(store, {
    app,
    biometrics,
    clipboard,
    persistence: persist,
    signers,
    trezorBridge: TrezorBridge,
    updater,
    vault,
    windows
  })
})
const mainApp = createProductionMainApp({
  accountCapabilities,
  accounts,
  agentService,
  chains,
  flashService,
  imageService,
  ipc: ipcMain,
  nameResolution,
  persistence,
  provider,
  proxy,
  rendererAuthorization,
  sideTrayTransactions,
  sideTrayWorkflows,
  store,
  walletWorkflows
})
const apiServer = createProductionApiServer(provider, accounts, flashService, store, agentService, windows)
mainApp.start()

log.info(`Chrome: v${process.versions.chrome}`)
log.info(`Electron: v${process.versions.electron}`)
log.info(`Node: v${process.versions.node}`)

// prevent showing the exit dialog more than once
let closing = false

process.on('uncaughtException', (e) => {
  log.error('Uncaught Exception!', e)

  const errorCode = getErrorCode(e) ?? ''

  if (errorCode === 'EPIPE') {
    log.error('uncaught EPIPE error', e)
    return
  }

  if (!closing) {
    closing = true

    showUnhandledExceptionDialog(e.message, errorCode)
  }
})

process.on('unhandledRejection', (e) => {
  log.error('Unhandled Rejection!', e)
})

function startUpdater() {
  let systemSuspended = false
  let screenLocked = false

  const isSystemInactive = () => systemSuspended || screenLocked

  const stopUpdater = (reason: string) => {
    log.debug(`System ${reason}, stopping updater`)
    updater.stop()
  }

  const resumeUpdater = (reason: string) => {
    if (isSystemInactive()) {
      log.debug(`System ${reason}, keeping updater stopped`, { systemSuspended, screenLocked })
      return
    }

    log.debug(`System ${reason}, starting updater`)
    updater.start()
  }

  powerMonitor.on('resume', () => {
    systemSuspended = false
    resumeUpdater('resuming')
  })

  powerMonitor.on('suspend', () => {
    systemSuspended = true
    stopUpdater('suspending')
  })

  powerMonitor.on('unlock-screen', () => {
    screenLocked = false
    resumeUpdater('unlocked')
  })

  powerMonitor.on('lock-screen', () => {
    screenLocked = true
    stopUpdater('locked')
  })

  updater.start()
}

let domainServicesStarted = false

function startDomainServices() {
  if (domainServicesStarted) return

  store.subscribe(
    (state) => state.main.launch,
    (launchEnabled) => (launchEnabled ? launch.enable() : launch.disable()),
    { fireImmediately: true }
  )
  apiServer.start()
  bundledTokens.start()
  accounts.startDataScanner()
  if (!isDev) startUpdater()

  domainServicesStarted = true
}

function configureWebAuthn() {
  const keychainAccessGroup = process.env.FRAME_WEBAUTHN_KEYCHAIN_ACCESS_GROUP

  if (process.platform !== 'darwin' || !keychainAccessGroup) return
  if (typeof app.configureWebAuthn !== 'function') return

  try {
    app.configureWebAuthn({
      touchID: {
        keychainAccessGroup,
        promptReason: 'verify your identity to unlock Newframe on $1'
      }
    })
  } catch (e) {
    log.warn('Unable to configure WebAuthn biometrics', e)
  }
}

void app.whenReady().then(async () => {
  try {
    await persistence.start()
  } catch (error) {
    log.error('Newframe startup aborted because canonical wallet state could not be loaded', error)
    app.quit()
    return
  }
  accounts.start()
  const biometricUnlockEnabled = biometrics.summary().enabled
  if (store.getState().main.biometricUnlock !== biometricUnlockEnabled) {
    store.getState().setBiometricUnlock(biometricUnlockEnabled)
  }
  const vaultSummary = vault.summary()
  store.getState().setAppLock({
    locked: vaultSummary.exists && !vaultSummary.unlocked,
    vaultExists: vaultSummary.exists
  })
  configureWebAuthn()
  startDomainServices()
  menu()
  windows.init(rendererAuthorization, store)
  if (app.dock) app.dock.hide()
  if (isDev) {
    const loadDev = async () => {
      const { installDevTools, startCpuMonitoring } = await import('./dev/index.js')
      installDevTools()
      startCpuMonitoring()
    }

    void loadDev()
  }

  // only allow file:// access to files within the app's own directory
  protocol.handle('file', (req) => {
    const appOrigin = path.resolve(import.meta.dirname, '../../')
    const filePath = url.fileURLToPath(req.url)

    if (filePath === appOrigin || filePath.startsWith(`${appOrigin}${path.sep}`)) {
      return net.fetch(url.pathToFileURL(filePath).toString(), { bypassCustomProtocolHandlers: true })
    }

    return new Response(null, { status: 403 })
  })
})

app.on('second-instance', (event, argv, workingDirectory) => {
  log.info(`second instance requested from directory: ${workingDirectory}`)
  windows.showTray()
})
app.on('activate', () => windows.showTray())

app.on('before-quit', () => {
  if (!updater.updateReady) {
    updater.stop()
  }
})

app.on('will-quit', () => app.quit())
app.on('quit', () => {
  log.info('Application closing')

  apiServer.dispose()
  mainApp.dispose()
  // await clients.stop()
  signers.close()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
