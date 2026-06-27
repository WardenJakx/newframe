import { BrowserWindow, BrowserWindowConstructorOptions, shell } from 'electron'
import log from 'electron-log'
import path from 'path'

import store from '../store'

import type { ChainId } from '../store/state'

export function createWindow(
  name: string,
  opts?: BrowserWindowConstructorOptions,
  webPreferences: BrowserWindowConstructorOptions['webPreferences'] = {}
) {
  log.verbose(`Creating ${name} window`)

  const browserWindow = new BrowserWindow({
    ...opts,
    frame: false,
    acceptFirstMouse: true,
    transparent: process.platform === 'darwin',
    show: false,
    backgroundColor: store('main.colorwayPrimary', store('main.colorway'), 'background'),
    skipTaskbar: process.platform !== 'linux',
    webPreferences: {
      ...webPreferences,
      preload: path.resolve(process.env.BUNDLE_LOCATION, 'bridge.js'),
      backgroundThrottling: false, // Allows repaint when window is hidden
      contextIsolation: true,
      webviewTag: false,
      sandbox: true,
      defaultEncoding: 'utf-8',
      nodeIntegration: false,
      scrollBounce: true,
      navigateOnDragDrop: false,
      disableBlinkFeatures: 'Auxclick'
    }
  })

  browserWindow.webContents.once('did-finish-load', () => {
    log.info(`Created ${name} renderer process, pid:`, browserWindow.webContents.getOSProcessId())
  })
  browserWindow.webContents.on('will-navigate', (e) => e.preventDefault()) // Prevent navigation
  browserWindow.webContents.on('will-attach-webview', (e) => e.preventDefault()) // Prevent attaching <webview>
  browserWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' })) // Prevent new windows

  return browserWindow
}

const externalWhitelist = [
  'https://newframe.sh',
  // Browser extension/social links hidden until replacements exist:
  // 'https://chrome.google.com/webstore/detail/frame-alpha/ldcoohedfbjoobcadoglnnmmfbdlmmhf',
  // 'https://addons.mozilla.org/en-US/firefox/addon/newframe-extension',
  'https://github.com/wardenjakx/newframe/issues/new',
  'https://github.com/wardenjakx/newframe/blob/main/apps/newframe/LICENSE',
  'https://shop.ledger.com/pages/ledger-nano-x?r=1fb484cde64f',
  'https://shop.trezor.io/?offer_id=10&aff_id=3270',
  // 'https://discord.gg/UH7NGqY',
  // 'https://feedback.newframe.sh',
  'https://opensea.io'
]

const isValidReleasePage = (url: string) =>
  url.startsWith('https://github.com/wardenjakx/newframe/releases/tag/')
const isWhitelistedHost = (url: string) =>
  externalWhitelist.some((entry) => url === entry || url.startsWith(entry + '/'))

export function openExternal(url = '') {
  if (isWhitelistedHost(url) || isValidReleasePage(url)) {
    shell.openExternal(url)
  }
}

export function openBlockExplorer({ id, type }: ChainId, hash?: string, account?: string) {
  // remove trailing slashes from the base url
  const explorer = (store('main.networks', type, id, 'explorer') || '').replace(/\/+$/, '')

  if (explorer) {
    if (hash) {
      const hashPath = hash && `/tx/${hash}`
      shell.openExternal(`${explorer}${hashPath}`)
    } else if (account) {
      const accountPath = account && `/address/${account}`
      shell.openExternal(`${explorer}${accountPath}`)
    } else {
      shell.openExternal(`${explorer}`)
    }
  }
}
