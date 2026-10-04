import path from 'path'
import url from 'url'

// oxlint-disable-next-line no-restricted-imports -- net only serves the app's own files to its windows.
import { app, clipboard, ipcMain, net, protocol } from 'electron'
import log from 'electron-log'

import { Updater } from '../../core/desktop-ui/app-update/index.ts'
import * as launch from '../../core/desktop-ui/launch.ts'
import menu from '../../core/desktop-ui/menu.ts'
import { getErrorCode } from '../../core/desktop-ui/runtime/errors.ts'
import { isVisualHarness } from '../../core/desktop-ui/runtime/visualHarness.ts'
import { lockWithSystem } from '../../core/desktop-ui/systemLock.ts'
import { showUnhandledExceptionDialog } from '../../core/desktop-ui/windows/dialog.ts'
import windows from '../../core/desktop-ui/windows/index.ts'
import { createProductionApiServer } from '../../core/entry/local-api/api/index.ts'
import { installInternetDefaults, internet } from '../../core/internet/index.ts'
import { routeInternet } from '../../core/internet/tor.ts'
import { createProductionImageServiceAdapters } from '../../core/services/assets/images/production.ts'
import { createProductionPortfolioAdapters } from '../../core/services/assets/portfolio/production.ts'
import { createBundledTokenService } from '../../core/services/assets/tokens/tokens.ts'
import { lookupChainlistIcon, rpcMatchesChain } from '../../core/services/chains/production.ts'
import { createProductionAccountOnboardingAdapters } from '../../features/accounts/main/accountOnboarding/production.ts'
import { createProductionAccountsRuntime } from '../../features/accounts/main/production.ts'
import { createProductionSecurityAdapters } from '../../features/security/main/production.ts'
import { createProductionPersistencePorts } from '../../platform/persistence/index.ts'
import biometrics from '../../platform/secrets/biometrics.ts'
import vault from '../../platform/secrets/vault.ts'
import { Signers } from '../../platform/signing/signers/index.ts'
import TrezorBridge from '../../platform/signing/signers/trezor/bridge.ts'
import store, { createCanonicalPersistenceService } from '../../platform/state-store/index.ts'
import persist from '../../platform/state-store/persist/index.ts'
import { createProductionCapabilities, createProductionMainApp } from './composition/index.ts'
import { createProductionPlatformAdapters } from './platform/production.ts'

installInternetDefaults()

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
log.transports.console.level = process.env.LOG_LEVEL ?? (isDev ? 'verbose' : 'info')

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
  aiSessionService,
  chains,
  flashService,
  imageService,
  nameResolution,
  platformService,
  portfolioService,
  provider,
  profileService,
  proxy,
  trayAuthorization,
  requestEditService,
  requestService,
  securityService,
  accountOnboardingService,
  airgapService,
  sendService,
  tradeService,
  sideTrayTransactions,
  settingsService,
  chainService,
  tokenService,
  safeService
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
  chain: { lookupChainIcon: lookupChainlistIcon, rpcMatchesChain }
})
const mainApp = createProductionMainApp({
  accountCapabilities,
  infrastructureCallbacks,
  accountService,
  accounts,
  aiSessionService,
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
  trayAuthorization,
  requestEditService,
  requestService,
  securityService,
  accountOnboardingService,
  airgapService,
  sendService,
  tradeService,
  sideTrayTransactions,
  settingsService,
  store,
  chainService,
  tokenService,
  safeService
})
const apiServer = createProductionApiServer(
  provider,
  accounts,
  flashService,
  store,
  aiSessionService,
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
  internet.subscribe((open) => (open ? updater.start() : updater.stop()))
}

let domainServicesStarted = false

function startDomainServices() {
  if (domainServicesStarted) {
    return
  }

  store.subscribe(
    (state) => state.main.launch,
    (launchEnabled) => (launchEnabled ? launch.enable() : launch.disable()),
    { fireImmediately: true }
  )
  lockWithSystem(() => signers.lockApp(() => {}))
  apiServer.start()
  bundledTokens.start()
  accounts.startDataScanner()
  if (!isDev) {
    startUpdater()
  }

  domainServicesStarted = true
}

function configureWebAuthn() {
  const keychainAccessGroup = process.env.FRAME_WEBAUTHN_KEYCHAIN_ACCESS_GROUP

  if (process.platform !== 'darwin' || !keychainAccessGroup) {
    return
  }
  if (typeof app.configureWebAuthn !== 'function') {
    return
  }

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
  routeInternet(internet, store.getState().main.torEnabled, (status) => store.getState().setTorStatus(status))
  signers.start()
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
  // The internet stays closed until stored state has loaded and its route is ready, then follows the lock.
  store.subscribe(
    (state) => state.main.appLock.locked,
    (locked) => internet.setOpen(!locked),
    { fireImmediately: true }
  )
  menu()
  windows.init(trayAuthorization, store)
  // Hiding the Dock icon would relax the harness's stricter 'prohibited' activation policy.
  if (app.dock && !isVisualHarness) {
    app.dock.hide()
  }
  if (isDev) {
    const loadDev = async () => {
      const { installDevTools, startCpuMonitoring } =
        await import('../../core/desktop-ui/runtime/dev/index.ts')
      // Installation logs failures internally; CPU monitoring starts immediately.
      void installDevTools()
      startCpuMonitoring()
    }

    loadDev().catch((error: unknown) => log.error('Could not load development tools', error))
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
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
