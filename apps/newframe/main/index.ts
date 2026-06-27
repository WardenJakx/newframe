import { app, ipcMain, net, protocol, clipboard, powerMonitor } from 'electron'
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
import store from './store'
import './localServer'
import accounts from './accounts'
import * as launch from './launch'
import updater from './updater'
import signers from './signers'
import biometrics from './biometrics'
import persist from './store/persist'
import imageCache from './imageCache'
import { createPortfolioProvider } from './portfolio'
import { showUnhandledExceptionDialog } from './windows/dialog'
import { openBlockExplorer, openExternal } from './windows/window'
import Erc20Contract from './contracts/erc20'
import { toTokenId } from '../resources/domain/balance'
import { cachedImageReference, isCachedImageReference } from '../resources/domain/imageCache'
import { getErrorCode } from '../resources/utils'

import type { Chain, Token } from './store/state'

app.commandLine.appendSwitch('enable-accelerated-2d-canvas', 'true')
app.commandLine.appendSwitch('enable-gpu-rasterization', 'true')
app.commandLine.appendSwitch('force-gpu-rasterization', 'true')
app.commandLine.appendSwitch('ignore-gpu-blacklist', 'true')
app.commandLine.appendSwitch('enable-native-gpu-memory-buffers', 'true')
app.commandLine.appendSwitch('force-color-profile', 'srgb')

const isDev = process.env.NODE_ENV === 'development'
log.transports.console.level = process.env.LOG_LEVEL || (isDev ? 'verbose' : 'info')

const MAX_PORTFOLIO_AUTO_DISCOVERY_TOKENS = 250

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

// eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy-loaded for side effects at startup
require('./rpc')

log.info(`Chrome: v${process.versions.chrome}`)
log.info(`Electron: v${process.versions.electron}`)
log.info(`Node: v${process.versions.node}`)

const biometricUnlockEnabled = biometrics.summary().enabled
if (store('main.biometricUnlock') !== biometricUnlockEnabled) {
  store.setBiometricUnlock(biometricUnlockEnabled)
}

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

global.eval = () => {
  throw new Error(`This app does not support global.eval()`)
}

function getPortfolioApiKey() {
  const apiKey = store('main.portfolioApiKey')
  return typeof apiKey === 'string' ? apiKey.trim() : ''
}

function getEnabledNetworkChainIds() {
  const networks = Object.values((store('main.networks.ethereum') || {}) as Record<string, Chain>)

  return networks.filter((network) => network.on).map((network) => network.id)
}

function getNewPortfolioTokens(address: Address, tokens: Token[]) {
  const customTokens = (store('main.tokens.custom') || []) as Token[]
  const knownTokens = (store('main.tokens.known', address) || []) as Token[]
  const trackedTokens = new Set([...customTokens, ...knownTokens].map(toTokenId))

  return tokens.filter((token) => !trackedTokens.has(toTokenId(token)))
}

async function hydrateChainIcon(chainId: number) {
  if (!Number.isInteger(chainId)) return { ok: false, error: 'invalid_chain' }

  const chain = store('main.networks.ethereum', chainId) as Chain | undefined
  if (!chain) return { ok: false, error: 'unknown_chain' }

  const existingIcon = (store('main.networksMeta.ethereum', chainId, 'icon') || '') as string
  if (isCachedImageReference(existingIcon)) {
    return { ok: true, icon: existingIcon, hydrated: false }
  }

  let sourceUrl = existingIcon

  if (!sourceUrl) {
    const apiKey = getPortfolioApiKey()
    if (!apiKey) return { ok: false, error: 'missing_api_key' }

    const image = await createPortfolioProvider({ apiKey }).getChainImage(chainId)
    sourceUrl = image?.url || ''
  }

  if (!sourceUrl) return { ok: false, error: 'no_icon' }

  const metadata = await imageCache.getCachedImage('icon', sourceUrl)
  const icon = cachedImageReference('icon', metadata.key)
  store.setNetworkIcon('ethereum', chainId, icon)

  return { ok: true, icon, hydrated: true }
}

ipcMain.on('tray:resetAllSettings', () => {
  persist.clear()

  if (updater.updateReady) {
    return updater.quitAndInstall()
  }

  app.relaunch()
  app.exit(0)
})

ipcMain.on('tray:replaceTx', async (e, id, type) => {
  store.navBack('panel')
  setTimeout(async () => {
    try {
      await accounts.replaceTx(id, type)
    } catch (e) {
      log.error('tray:replaceTx Error', e)
    }
  }, 1000)
})

ipcMain.on('tray:clipboardData', (e, data) => {
  if (data) clipboard.writeText(data)
})

ipcMain.on('tray:installAvailableUpdate', () => {
  store.updateBadge('')

  updater.fetchUpdate()
})

ipcMain.on('tray:dismissUpdate', (e, version, remind) => {
  if (!remind) {
    store.dontRemind(version)
  }

  store.updateBadge('')

  updater.dismissUpdate()
})

ipcMain.on('tray:removeAccount', (e, id) => {
  accounts.remove(id)
})

ipcMain.on('tray:renameAccount', (e, id, name) => {
  accounts.rename(id, name)
})

ipcMain.on('dash:removeSigner', (e, id) => {
  signers.remove(id)
})

ipcMain.on('dash:reloadSigner', (e, id) => {
  signers.reload(id)
})

ipcMain.on('tray:resolveRequest', (e, req, result) => {
  accounts.resolveRequest(req, result)
})

ipcMain.on('tray:rejectRequest', (e, req) => {
  const err = { code: 4001, message: 'User rejected the request' }
  accounts.rejectRequest(req, err)
})

ipcMain.on('tray:clearRequestsByOrigin', (e, account, origin) => {
  accounts.clearRequestsByOrigin(account, origin)
})

ipcMain.on('tray:openExternal', (e, url) => {
  openExternal(url)
  store.setDash({ showing: false })
})

ipcMain.on('tray:openExplorer', (e, chain, hash, account) => {
  openBlockExplorer(chain, hash, account)
})

ipcMain.on('tray:copyTxHash', (e, hash) => {
  if (hash) clipboard.writeText(hash)
})

ipcMain.on('tray:giveAccess', (e, req, access) => {
  accounts.setAccess(req, access)
})

ipcMain.on('tray:addChain', (e, chain, req) => {
  store.addNetwork(chain)
  if (req) accounts.resolveRequest(req)
})

ipcMain.on('tray:switchChain', (e, type, id, req) => {
  if (type && id) store.selectNetwork(type, id)
  accounts.resolveRequest(req)
})

ipcMain.handle('tray:getTokenDetails', async (e, contractAddress, chainId) => {
  try {
    const contract = new Erc20Contract(contractAddress, chainId)
    return await contract.getTokenData()
  } catch (e) {
    log.warn('Could not load token data for contract', { contractAddress, chainId })
    return {}
  }
})

ipcMain.handle('tray:hydrateChainIcon', async (e, chainId: number) => {
  try {
    return await hydrateChainIcon(chainId)
  } catch (e) {
    log.warn('Could not hydrate chain icon', { chainId }, e)
    return { ok: false, error: 'hydrate_failed' }
  }
})

ipcMain.handle('tray:refreshPortfolioBalances', async (e, accountId?: string) => {
  const selectedAccount = (store('selected.current') || '') as Address
  const account = (accountId && store('main.accounts', accountId)) || undefined
  const address = (
    (account?.address || accountId || selectedAccount || '') as string
  ).toLowerCase() as Address

  if (!address) {
    return { ok: false, error: 'no_account', tokensAdded: 0 }
  }

  let tokensAdded = 0
  let portfolioValue: number | null = null
  let error: string | undefined

  const apiKey = getPortfolioApiKey()
  const chainIds = getEnabledNetworkChainIds()

  if (!apiKey) {
    error = 'missing_api_key'
  } else {
    try {
      const portfolio = await createPortfolioProvider({ apiKey }).getWalletPortfolio(address, chainIds, {
        sync: true
      })
      const autoDiscoverTokens = store('main.autoDiscoverTokens') !== false
      const newTokens = autoDiscoverTokens
        ? getNewPortfolioTokens(address, portfolio.tokens).slice(0, MAX_PORTFOLIO_AUTO_DISCOVERY_TOKENS)
        : []

      portfolioValue = portfolio.totalValue
      tokensAdded = newTokens.length

      if (newTokens.length > 0) {
        store.addKnownTokens(address, newTokens)
      }

      if (portfolio.balances.length > 0) {
        store.setPortfolioBalances(address, portfolio.balances)
        store.accountTokensUpdated(address)
      }

      if (Object.keys(portfolio.rates).length > 0) {
        store.setRates(portfolio.rates)
      }

      Object.entries(portfolio.nativeRates).forEach(([chainId, rate]) => {
        store.setNativeCurrencyData('ethereum', parseInt(chainId, 10), { usd: rate })
      })

      persist.writeUpdates()
      setTimeout(() => persist.writeUpdates(), 0)
    } catch (e) {
      error = 'portfolio_provider_failed'
      log.warn(`Could not refresh portfolio provider balances for ${address}`, e)
    }
  }

  if (error) {
    accounts.refreshBalances(address)
  }

  return { ok: !error, error, tokensAdded, portfolioValue }
})

ipcMain.on('tray:addToken', (e, token, req) => {
  if (token) {
    log.info('adding custom token', token)
    store.addCustomTokens([token])
  }
  if (req) accounts.resolveRequest(req)
})

ipcMain.on('tray:removeToken', (e, token) => {
  if (token) {
    log.info('removing custom token', token)

    store.removeBalance(token.chainId, token.address)
    store.removeCustomTokens([token])
  }
})

ipcMain.on('tray:adjustNonce', (e, handlerId, nonceAdjust) => {
  accounts.adjustNonce(handlerId, nonceAdjust)
})

ipcMain.on('tray:resetNonce', (e, handlerId) => {
  accounts.resetNonce(handlerId)
})

ipcMain.on('tray:removeOrigin', (e, handlerId) => {
  accounts.removeRequests(handlerId)
  store.removeOrigin(handlerId)
})

ipcMain.on('tray:clearOrigins', () => {
  Object.keys(store('main.origins')).forEach((handlerId) => {
    accounts.removeRequests(handlerId)
  })
  store.clearOrigins()
})

ipcMain.on('tray:syncPath', (e, path, value) => {
  store.syncPath(path, value)
})

ipcMain.on('tray:ready', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy-loaded once the tray is ready
  require('./api')

  if (!isDev) {
    startUpdater()
  }
})

ipcMain.on('tray:updateRestart', () => {
  updater.quitAndInstall()
})

ipcMain.on('frame:close', (e) => {
  windows.close(e)
})

ipcMain.on('frame:min', (e) => {
  windows.min(e)
})

ipcMain.on('frame:max', (e) => {
  windows.max(e)
})

ipcMain.on('frame:unmax', (e) => {
  windows.unmax(e)
})

ipcMain.on('*:addFrame', (e, id) => {
  const existingFrame = store('main.frames', id)

  if (existingFrame) {
    windows.refocusFrame(id)
  } else {
    store.addFrame({
      id
    })
  }
})

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

app.on('ready', () => {
  configureWebAuthn()
  menu()
  windows.init()
  if (app.dock) app.dock.hide()
  if (isDev) {
    const loadDev = async () => {
      const { installDevTools, startCpuMonitoring } = await import('./dev')
      installDevTools()
      startCpuMonitoring()
    }

    void loadDev()
  }

  // only allow file:// access to files within the app's own directory
  protocol.handle('file', (req) => {
    const appOrigin = path.resolve(__dirname, '../../')
    const filePath = url.fileURLToPath(req.url)

    if (filePath.startsWith(appOrigin)) {
      return net.fetch(url.pathToFileURL(filePath).toString(), { bypassCustomProtocolHandlers: true })
    }

    return new Response(null, { status: 403 })
  })
})

ipcMain.on('tray:action', (e, action, ...args) => {
  if (store[action]) return store[action](...args)
  log.info('Tray sent unrecognized action: ', action)
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
  accounts.close()
  signers.close()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

let launchStatus = store('main.launch')

store.observer(() => {
  if (launchStatus !== store('main.launch')) {
    launchStatus = store('main.launch')
    if (launchStatus) {
      launch.enable()
    } else {
      launch.disable()
    }
  }
})
