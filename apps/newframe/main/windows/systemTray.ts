import fs from 'fs'
import path from 'path'
import { app, screen, BrowserWindow, Menu, KeyboardEvent, Rectangle, Tray as ElectronTray } from 'electron'

import { capitalize } from '../../resources/utils'

const isMacOS = process.platform === 'darwin'
let isUbuntu23OrGreater = false

if (process.platform === 'linux') {
  try {
    const osRelease = Object.fromEntries(
      fs
        .readFileSync('/etc/os-release', 'utf8')
        .split('\n')
        .filter((line) => line.includes('='))
        .map((line) => {
          const [key, ...value] = line.split('=')
          return [key, value.join('=').replace(/^"|"$/g, '')]
        })
    )

    if (osRelease.ID === 'ubuntu' && osRelease.VERSION_ID) {
      const majorVersion = parseInt(osRelease.VERSION_ID.split('.')[0], 10)
      isUbuntu23OrGreater = majorVersion >= 23
    }
  } catch (error) {
    console.error('Could not determine Linux version', error)
  }
}

const delaySettingContextMenu = () => !isMacOS && !isUbuntu23OrGreater

export type SystemTrayEventHandlers = {
  click: () => void
  clickShow: () => void
  clickHide: () => void
}

export class SystemTray {
  private clickHandlers: SystemTrayEventHandlers
  private electronTray?: ElectronTray

  constructor(clickHandlers: SystemTrayEventHandlers) {
    this.clickHandlers = clickHandlers
  }

  init(mainWindow: BrowserWindow) {
    // Electron Tray can only be instantiated when the app is ready
    this.electronTray = new ElectronTray(path.join(__dirname, isMacOS ? './IconTemplate.png' : './Icon.png'))
    this.electronTray.on('click', (_event: KeyboardEvent, bounds: Rectangle) => {
      const mainWindowBounds = mainWindow.getBounds()
      const currentDisplay = screen.getDisplayMatching(bounds)
      const trayClickDisplay = screen.getDisplayMatching(mainWindowBounds)
      if (trayClickDisplay.id !== currentDisplay.id) {
        this.setContextMenu('show', { switchScreen: true })
      }
      this.clickHandlers.click()
    })
  }

  setContextMenu(
    type: string,
    { displaySummonShortcut = false, accelerator = 'Alt+/', switchScreen = false }
  ) {
    const separatorMenuItem = {
      label: 'Newframe',
      click: () => {},
      type: 'separator'
    }
    const menuItemLabelMap = {
      hide: 'Dismiss',
      show: 'Summon'
    }
    const label = menuItemLabelMap[type as keyof typeof menuItemLabelMap]
    const eventName = `click${capitalize(type)}`
    const actionMenuItem: Electron.MenuItemConstructorOptions = {
      label,
      click: () => this.clickHandlers[eventName as keyof typeof this.clickHandlers](),
      toolTip: `${label} Newframe`
    }
    const quitMenuItem = {
      label: 'Quit',
      click: () => app.quit()
    }

    if (displaySummonShortcut) {
      actionMenuItem.accelerator = accelerator
      actionMenuItem.registerAccelerator = false
    }

    const menu = Menu.buildFromTemplate([actionMenuItem, separatorMenuItem, quitMenuItem])

    if (switchScreen) {
      this.electronTray?.setContextMenu(menu)
    } else {
      setTimeout(() => this.electronTray?.setContextMenu(menu), delaySettingContextMenu() ? 200 : 0)
    }
  }

  closeContextMenu() {
    this.electronTray?.closeContextMenu()
  }

  setTitle(title: string) {
    this.electronTray?.setTitle(title)
  }
}
