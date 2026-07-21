import { app, net, protocol, powerMonitor } from 'electron'
import path from 'path'
import log from 'electron-log'
import url from 'url'

// DO NOT MOVE - env var below is required for app init and must be set before all local imports
process.env.BUNDLE_LOCATION = process.env.BUNDLE_LOCATION || path.resolve(__dirname, './../..', 'bundle')

const appName = 'Newframe'
const devAppName = 'Newframe dev'
const isDevApp =
  process.env.FRAME_PROFILE === 'dev' ||
  Boolean((process as NodeJS.Process & { defaultApp?: boolean }).defaultApp)
const profileAppName = isDevApp ? devAppName : appName

app.setName(profileAppName)
app.setPath('userData', path.join(app.getPath('appData'), profileAppName))

import windows from './windows'
import menu from './menu'
import store, { canonicalStoreHydration } from './store'
import images from './images'
import tokens from './tokens'
import accounts from './accounts'
import * as launch from './launch'
import updater from './updater'
import signers from './signers'
import biometrics from './biometrics'
import vault from './vault'
import { showUnhandledExceptionDialog } from './windows/dialog'
import { getErrorCode } from '../resources/utils'
import { registerOperationHandlers } from './ipc/operations'
import { registerStateStreamHandlers } from './ipc/stateStream'
import { flashService } from './flash/instance'

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

registerOperationHandlers()
registerStateStreamHandlers()

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
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- start the API only after hydration
  require('./api')
  tokens.start()
  images.start()
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

app.on('ready', async () => {
  try {
    await canonicalStoreHydration
  } catch (error) {
    log.error('Newframe startup aborted because canonical wallet state could not be loaded', error)
    app.quit()
    return
  }
  accounts.initialize()
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
  windows.init()
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
    const appOrigin = path.resolve(__dirname, '../../')
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

  // await clients.stop()
  flashService.dispose()
  accounts.close()
  signers.close()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
