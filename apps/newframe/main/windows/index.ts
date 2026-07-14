import {
  app as electronApp,
  BrowserWindow,
  screen,
  globalShortcut,
  type IpcMainEvent,
  type WebContents
} from 'electron'
import path from 'path'
import log from 'electron-log'
import EventEmitter from 'events'
import { shallow } from 'zustand/vanilla/shallow'
import { hexToInt, roundGwei } from '../../resources/utils'

import store from '../store'
import FrameManager from './frames'
import { createWindow } from './window'
import { SystemTray, SystemTrayEventHandlers } from './systemTray'
import { registerShortcut } from '../keyboardShortcuts'
import { Shortcut } from '../store/state/types/shortcuts'

type Windows = { [key: string]: BrowserWindow }

export function onTrayRendererReady(webContents: Pick<WebContents, 'off' | 'once'>, ready: () => void) {
  let handled = false
  const handler = () => {
    if (handled) return
    handled = true
    ready()
  }

  webContents.once('did-finish-load', handler)
  return () => webContents.off('did-finish-load', handler)
}

const events = new EventEmitter()
const frameManager = new FrameManager()
const isDev = process.env.NODE_ENV === 'development'
const devToolsEnabled = isDev || process.env.ENABLE_DEV_TOOLS === 'true'
const fullheight = !!process.env.FULL_HEIGHT
const openedAtLogin =
  electronApp?.getLoginItemSettings() && electronApp.getLoginItemSettings().wasOpenedAtLogin
const windows: Windows = {}
const showOnReady = true
const trayWidth = 400
const devHeight = 800
const isWindows = process.platform === 'win32'
const isMacOS = process.platform === 'darwin'

let tray: Tray
let dash: Dash
let mouseTimeout: NodeJS.Timeout
let glide = false

const app = {
  hide: () => {
    frameManager.hideAll()
    tray.hide()
    if (dash.isVisible()) {
      dash.hide('app')
    }
  },
  show: () => {
    tray.show()
    if (dash.hiddenByAppHide || dash.isVisible()) {
      store.getState().setDash({ show: true })
    }
    frameManager.showAll()
  },
  toggle: () => {
    const eventName = tray.isVisible() ? 'hide' : 'show'
    app[eventName as keyof typeof app]()
  }
}
const systemTrayEventHandlers: SystemTrayEventHandlers = {
  click: () => {
    if (isWindows) {
      app.toggle()
    }
  },
  clickHide: () => app.hide(),
  clickShow: () => app.show()
}
const systemTray = new SystemTray(systemTrayEventHandlers)
const getDisplaySummonShortcut = () => store.getState().main.shortcuts.altSlash

const topRight = (window: BrowserWindow) => {
  const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
  const screenSize = area
  const windowSize = window.getSize()
  return {
    x: Math.floor(screenSize.x + screenSize.width - windowSize[0]),
    y: screenSize.y
  }
}

const detectMouse = () => {
  const m1 = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(m1)
  const area = display.workArea
  const bounds = display.bounds
  const minX = area.width + area.x - 2
  const center = (area.height + (area.y - bounds.y)) / 2
  const margin = (area.height + (area.y - bounds.y)) / 2 - 5
  m1.y = m1.y - area.y
  const minY = center - margin
  const maxY = center + margin
  mouseTimeout = setTimeout(() => {
    if (m1.x >= minX && m1.y >= minY && m1.y <= maxY) {
      const m2 = screen.getCursorScreenPoint()
      const area = screen.getDisplayNearestPoint(m2).workArea
      m2.y = m2.y - area.y
      if (m2.x >= minX && m2.y === m1.y) {
        glide = true
        app.show()
      } else {
        detectMouse()
      }
    } else {
      detectMouse()
    }
  }, 50)
}

function initWindow(id: string, opts: Electron.BrowserWindowConstructorOptions, rendererReady?: () => void) {
  // in development, serve files from local filesystem instead of the created bundle
  const url = isDev
    ? `http://localhost:1234/${id}/index.dev.html`
    : new URL(path.join(process.env.BUNDLE_LOCATION, `${id}.html`), 'file:')

  const window = createWindow(id, opts)
  windows[id] = window
  const removeRendererReady = rendererReady
    ? onTrayRendererReady(window.webContents, rendererReady)
    : () => {}

  window.once('closed', () => {
    removeRendererReady()
    if (windows[id] === window) delete windows[id]
  })

  window.loadURL(url.toString())
  return { removeRendererReady, window }
}

function initTrayWindow(rendererReady: () => void) {
  const trayOpts: Electron.BrowserWindowConstructorOptions = {
    width: trayWidth,
    icon: path.join(__dirname, './AppIcon.png')
  }
  if (isMacOS) {
    trayOpts.type = 'panel'
  }
  const { removeRendererReady, window: trayWindow } = initWindow('tray', trayOpts, rendererReady)

  trayWindow.webContents.session.setPermissionRequestHandler((webContents, permission, res) => res(false))
  trayWindow.setResizable(false)
  trayWindow.setMovable(false)

  const { width, height, x, y } = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
  trayWindow.setPosition(width + x, height + y)

  trayWindow.on('show', () => {
    if (process.platform === 'win32') {
      systemTray.closeContextMenu()
    }
    systemTray.setContextMenu('hide', { displaySummonShortcut: getDisplaySummonShortcut() })
  })
  trayWindow.on('hide', () => {
    if (process.platform === 'win32') {
      systemTray.closeContextMenu()
    }
    systemTray.setContextMenu('show', { displaySummonShortcut: getDisplaySummonShortcut() })
  })

  setTimeout(() => {
    trayWindow.on('focus', () => {
      if (isMacOS) {
        glide = false
      }
      tray.show()
    })
  }, 2000)

  if (devToolsEnabled) {
    trayWindow.webContents.openDevTools()
  }

  setTimeout(() => {
    trayWindow.on('blur', () => {
      setTimeout(() => {
        if (tray.canAutoHide()) {
          tray.hide()
        }
      }, 100)
    })
    trayWindow.focus()
  }, 1260)

  trayWindow.once('ready-to-show', () => {
    if (!openedAtLogin) {
      tray.show()
    }
  })

  setTimeout(() => {
    screen.on('display-added', () => tray.hide())
    screen.on('display-removed', () => tray.hide())
    screen.on('display-metrics-changed', () => tray.hide())
  }, 30 * 1000)

  return removeRendererReady
}

class Tray {
  private recentDisplayEvent = false
  private recentDisplayEventTimeout?: NodeJS.Timeout
  private gasObserver: () => void
  private removeRendererReady: () => void
  private ready = false
  private readyHandler: () => void

  constructor() {
    const updateGasTitle = () => {
      let title = ''
      if (store.getState().platform === 'darwin' && store.getState().main.menubarGasPrice) {
        const gasPrice = store.getState().main.networksMeta.ethereum[1].gas.price.levels.fast
        if (!gasPrice) return
        const gasDisplay = roundGwei(hexToInt(gasPrice) / 1e9).toString()
        title = gasDisplay // ɢ 🄶 Ⓖ ᴳᵂᴱᴵ
      }
      systemTray.setTitle(title)
    }
    updateGasTitle()
    this.gasObserver = store.subscribe(
      (state) =>
        [
          state.platform,
          state.main.menubarGasPrice,
          state.main.networksMeta.ethereum[1]?.gas.price.levels.fast
        ] as const,
      updateGasTitle,
      { equalityFn: shallow }
    )
    this.readyHandler = () => {
      if (this.ready || !windows.tray || windows.tray.isDestroyed()) return
      this.ready = true
      systemTray.init(windows.tray)
      systemTray.setContextMenu('hide', { displaySummonShortcut: getDisplaySummonShortcut() })
      if (showOnReady) {
        store.getState().trayOpen(true)
      }

      const showOnboardingWindow = !store.getState().main.mute.onboardingWindow

      if (store.getState().windows.dash.show) {
        setTimeout(() => {
          store.getState().setDash({ show: true })
        }, 300)
      }

      if (showOnboardingWindow) {
        setTimeout(() => {
          store.getState().navHome({ view: 'accounts', data: { showAddAccounts: true } })
          store.getState().completeOnboarding()
        }, 600)
      }
    }
    this.removeRendererReady = initTrayWindow(this.readyHandler)
  }

  isReady() {
    return this.ready
  }

  isVisible() {
    return (windows.tray as BrowserWindow).isVisible()
  }

  canAutoHide() {
    const autoHideOn = !!store.getState().main.autohide
    const dashShowing = !!store.getState().windows.dash.show
    const isFrameShowing = frameManager.isFrameShowing()

    log.debug(`%ccanAutoHide ${JSON.stringify({ autoHideOn, dashShowing, isFrameShowing })}`, 'color: blue')

    return autoHideOn && !dashShowing && !isFrameShowing
  }

  hide() {
    if (this.recentDisplayEvent || !windows.tray?.isVisible()) {
      return
    }
    clearTimeout(this.recentDisplayEventTimeout)
    this.recentDisplayEvent = true
    this.recentDisplayEventTimeout = setTimeout(() => {
      this.recentDisplayEvent = false
    }, 150)

    store.getState().toggleDash('hide')
    store.getState().trayOpen(false)
    if (store.getState().main.reveal) {
      detectMouse()
    }
    windows.tray.emit('hide')
    windows.tray.hide()
    events.emit('tray:hide')
  }

  public show() {
    clearTimeout(mouseTimeout)
    if (!windows.tray) {
      return init()
    }
    if (this.recentDisplayEvent) {
      return
    }
    clearTimeout(this.recentDisplayEventTimeout)
    this.recentDisplayEvent = true
    this.recentDisplayEventTimeout = setTimeout(() => {
      this.recentDisplayEvent = false
    }, 150)

    if (isMacOS) {
      windows.tray.setPosition(0, 0)
    } else {
      windows.tray.setAlwaysOnTop(true)
    }
    windows.tray.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true
    })
    windows.tray.setResizable(false) // Keeps height consistent
    const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
    const height = isDev && !fullheight ? devHeight : area.height
    windows.tray.setMinimumSize(trayWidth, height)
    windows.tray.setSize(trayWidth, height)
    windows.tray.setMaximumSize(trayWidth, height)
    const pos = topRight(windows.tray)
    windows.tray.setPosition(pos.x, pos.y)
    store.getState().trayOpen(true)
    windows.tray.emit('show')
    if (glide && isMacOS) {
      windows.tray.showInactive()
    } else {
      windows.tray.show()
    }
    events.emit('tray:show')
    if (windows && windows.tray && windows.tray.focus && !glide) {
      windows.tray.focus()
    }
    windows.tray.setVisibleOnAllWorkspaces(false, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true
    })
  }

  toggle() {
    if (!this.isReady()) return

    if (this.isVisible()) {
      this.hide()
    } else {
      this.show()
    }
  }

  destroy() {
    this.gasObserver()
    this.removeRendererReady()
  }
}

class Dash {
  private recentDisplayEvent = false
  private recentDisplayEventTimeout?: NodeJS.Timeout
  public hiddenByAppHide = false

  constructor() {
    const dashOpts: Electron.BrowserWindowConstructorOptions = {
      width: trayWidth
    }
    if (isMacOS) {
      dashOpts.type = 'panel'
    }
    initWindow('dash', dashOpts)
  }

  public hide(context?: string) {
    if (this.recentDisplayEvent || !windows.dash?.isVisible()) {
      return
    }
    if (context === 'app') {
      this.hiddenByAppHide = true
    }
    clearTimeout(this.recentDisplayEventTimeout)
    this.recentDisplayEvent = true
    this.recentDisplayEventTimeout = setTimeout(() => {
      this.recentDisplayEvent = false
    }, 150)
    windows.dash.hide()
  }

  public show() {
    if (!tray.isReady() || this.recentDisplayEvent) {
      return
    }
    if (this.hiddenByAppHide) {
      this.hiddenByAppHide = false
    }
    clearTimeout(this.recentDisplayEventTimeout)
    this.recentDisplayEvent = true
    this.recentDisplayEventTimeout = setTimeout(() => {
      this.recentDisplayEvent = false
    }, 150)
    setTimeout(() => {
      if (isMacOS) {
        windows.dash.setPosition(0, 0)
      } else {
        windows.dash.setAlwaysOnTop(true)
      }
      windows.dash.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true,
        skipTransformProcessType: true
      })
      windows.dash.setResizable(false) // Keeps height consistent
      const area = screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea
      const height = isDev && !fullheight ? devHeight : area.height
      windows.dash.setMinimumSize(trayWidth, height)
      windows.dash.setSize(trayWidth, height)
      windows.dash.setMaximumSize(trayWidth, height)
      const { x, y } = topRight(windows.dash)
      windows.dash.setPosition(x - trayWidth - 5, y)
      windows.dash.show()
      if (!windows.tray.isVisible()) windows.tray.show()
      windows.dash.focus()
      windows.dash.setVisibleOnAllWorkspaces(false, {
        visibleOnFullScreen: true,
        skipTransformProcessType: true
      })
      if (devToolsEnabled) {
        windows.dash.webContents.openDevTools()
      }
    }, 10)
  }

  isVisible() {
    return (windows.dash as BrowserWindow).isVisible()
  }
}

const handleTrayMouseout = () => {
  if (glide && !(windows.dash && windows.dash.isVisible())) {
    glide = false
    app.hide()
  }
}

// deny navigation, webview attachment & new windows on creation of webContents
// also set elsewhere but enforced globally here to minimize possible vectors of attack
// - in the case of e.g. dependency injection
// - as a 'to be sure' against possibility of misconfiguration in the future
electronApp.on('web-contents-created', (_e, contents) => {
  contents.on('will-navigate', (e) => e.preventDefault())
  contents.on('will-attach-webview', (e) => e.preventDefault())
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
})

if (isDev) {
  electronApp.once('ready', () => {
    globalShortcut.register('CommandOrControl+R', () => {
      Object.keys(windows).forEach((win) => {
        windows[win].reload()
      })
    })
  })
}

let stateUnsubscribers: Array<() => void> = []
let frameManagerStarted = false

const init = () => {
  if (tray && windows.tray && !windows.tray.isDestroyed()) return

  if (!frameManagerStarted) {
    frameManager.start()
    frameManagerStarted = true
  }

  const activeDash = dash && windows.dash && !windows.dash.isDestroyed() ? dash : undefined
  if (tray) {
    tray.destroy()
  }

  tray = new Tray()
  dash = activeDash || new Dash()

  stateUnsubscribers.forEach((unsubscribe) => unsubscribe())

  const updateDashVisibility = (show: boolean) => {
    if (show) {
      dash.show()
    } else {
      dash.hide()
      const trayWindow = windows.tray
      if (trayWindow && !trayWindow.isDestroyed()) trayWindow.focus()
    }
  }

  const updateHomeCommand = (homeCommand: unknown) => {
    if (homeCommand) tray.show()
  }

  const updateSummonShortcut = (summonShortcut: Shortcut) => {
    const summonHandler = (accelerator: string) => {
      app.toggle()
      if (tray?.isReady()) {
        systemTray.setContextMenu(tray.isVisible() ? 'hide' : 'show', {
          displaySummonShortcut: summonShortcut.enabled,
          accelerator
        })
      }
    }

    registerShortcut(summonShortcut, summonHandler)
  }

  const state = store.getState()
  updateDashVisibility(Boolean(state.windows.dash.show))
  updateHomeCommand(state.tray.homeCommand)
  updateSummonShortcut(state.main.shortcuts.summon)

  stateUnsubscribers = [
    store.subscribe((next) => Boolean(next.windows.dash.show), updateDashVisibility),
    store.subscribe((next) => next.tray.homeCommand, updateHomeCommand),
    store.subscribe((next) => next.main.shortcuts.summon, updateSummonShortcut)
  ]
}

export default {
  handleTrayMouseout,
  toggleTray() {
    tray.toggle()
  },
  showTray() {
    tray.show()
  },
  refocusFrame(frameId: string) {
    frameManager.refocus(frameId)
  },
  close(e: Pick<IpcMainEvent, 'sender'>) {
    BrowserWindow.fromWebContents(e.sender)?.close()
  },
  init
}
