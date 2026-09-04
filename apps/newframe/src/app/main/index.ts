import { app, clipboard, ipcMain, net, protocol, powerMonitor } from 'electron'
import path from 'path'
import log from 'electron-log'
import url from 'url'

import windows from '../../platform/desktop/windows/index.js'
import menu from '../../platform/desktop/menu.js'
import store, { createCanonicalPersistenceService } from '../../platform/state-store/index.js'
import persist from '../../platform/state-store/persist/index.js'
import { createBundledTokenService } from '../../features/tokens/main/tokens.js'
import * as launch from '../../platform/desktop/launch.js'
import { Updater } from '../../platform/app-update/index.js'
import { Signers } from '../../platform/signing/signers/index.js'
import TrezorBridge from '../../platform/signing/signers/trezor/bridge.js'
import biometrics from '../../platform/secrets/biometrics.js'
import vault from '../../platform/secrets/vault.js'
import { showUnhandledExceptionDialog } from '../../platform/desktop/windows/dialog.js'
import { getErrorCode } from '../../platform/runtime/errors.js'
import { createProductionCapabilities, createProductionMainApp } from './composition/index.js'
import { createProductionPersistencePorts } from '../../platform/persistence/index.js'
import { createProductionAccountsRuntime } from '../../features/accounts/main/production.js'
import { createProductionImageServiceAdapters } from '../../features/asset-data/main/images/production.js'
import { createProductionPlatformAdapters } from './platform/production.js'
import { createProductionPortfolioAdapters } from '../../features/portfolio/main/production.js'
import { lookupChainlistIcon, rpcMatchesChain } from '../../features/networks/main/production.js'
import { createProductionAccountOnboardingAdapters } from '../../features/accounts/main/accountOnboarding/production.js'
import { createProductionSecurityAdapters } from '../../features/security/main/production.js'
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
  infrastructureCallbacks,
  accountService,
  accounts,
  agentService,
  chains,
  flashService,
  imageService,
  nameResolution,
  platformService,
  portfolioService,
  provider,
  profileService,
  proxy,
  rendererAuthorization,
  requestEditService,
  requestService,
  securityService,
  accountOnboardingService,
  sendService,
  tradeService,
  sideTrayTransactions,
  settingsService,
  networkService,
  tokenService
} = createProductionCapabilities(store, {
  accounts: createProductionAccountsRuntime(store, { persistence: persist, signers, windows }),
  images: createProductionImageServiceAdapters(store),
  platform: createProductionPlatformAdapters(store, {
    app,
    clipboard,
    updater,
    windows
  }),
  portfolio: createProductionPortfolioAdapters(store),
  security: createProductionSecurityAdapters({
    app,
    biometrics,
    persistence: persist,
    signers,
    updater,
    vault
  }),
  accountOnboarding: createProductionAccountOnboardingAdapters({
    signers,
    store,
    trezorBridge: TrezorBridge
  }),
  network: { lookupChainIcon: lookupChainlistIcon, rpcMatchesChain }
})
const mainApp = createProductionMainApp({
  accountCapabilities,
  infrastructureCallbacks,
  accountService,
  accounts,
  agentService,
  chains,
  flashService,
  imageService,
  ipc: ipcMain,
  nameResolution,
  persistence,
  provider,
  platformService,
  portfolioService,
  profileService,
  proxy,
  rendererAuthorization,
  requestEditService,
  requestService,
  securityService,
  accountOnboardingService,
  sendService,
  tradeService,
  sideTrayTransactions,
  settingsService,
  store,
  networkService,
  tokenService
})
const apiServer = createProductionApiServer(
  provider,
  accounts,
  flashService,
  store,
  agentService,
  requestService,
  windows
)
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
      const { installDevTools, startCpuMonitoring } = await import('../../platform/runtime/dev/index.js')
      installDevTools()
      startCpuMonitoring()
    }

    void loadDev()
  }

  // only allow file:// access to files within the app's own directory
  protocol.handle('file', (req) => {
    const appOrigin = path.resolve(import.meta.dirname, '../../../../')
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
