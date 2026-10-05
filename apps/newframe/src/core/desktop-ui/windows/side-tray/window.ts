import path from 'path'

import type { BrowserWindow } from 'electron'
import log from 'electron-log'

import type { TrayAuthorizationRegistry } from '../../../entry/tray/authorization.ts'
import type { Frame } from '../../../state/store/state/index.ts'
import { constrainTraySize, sideTrayPosition } from '../trayGeometry.ts'
import { createWindow } from '../window.ts'
import { cursorWorkArea } from '../workArea.ts'

const isDev = process.env.NODE_ENV === 'development'

export interface SideTray extends BrowserWindow {
  contentRoute?: string
}

const placeSideTray = (sideTray: SideTray) => {
  const area = cursorWorkArea()

  if (process.platform !== 'darwin') {
    sideTray.setAlwaysOnTop(true)
  }
  sideTray.setMovable(false)
  constrainTraySize(sideTray, area.height)
  const { x, y } = sideTrayPosition(area)
  sideTray.setPosition(x, y)
}

const routeHash = (route?: string) => {
  return route?.startsWith('/') ? `#${route}` : ''
}

const frameUrl = (frame: Frame) => {
  const baseUrl = isDev
    ? 'http://localhost:1234/side-tray/index.dev.html'
    : `file://${process.env.BUNDLE_LOCATION}/side-tray.html`

  return `${baseUrl}${routeHash(frame.route)}`
}

const load = (sideTray: SideTray, frame: Frame) => {
  sideTray.contentRoute = frame.route ?? ''
  placeSideTray(sideTray)
  sideTray.loadURL(frameUrl(frame)).catch((error: unknown) => log.error('Could not load side tray', error))
}

const show = (sideTray: SideTray) => {
  placeSideTray(sideTray)
  sideTray.show()
  sideTray.focus()
}

export default {
  load,
  show,
  create: (frame: Frame, registerTray: TrayAuthorizationRegistry['registerTray']) => {
    const windowOptions: Electron.BrowserWindowConstructorOptions = {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      icon: path.join(import.meta.dirname, '../AppIcon.png')
    }

    if (process.platform === 'darwin') {
      windowOptions.type = 'panel'
    }

    const sideTray: SideTray = createWindow('side-tray', registerTray, {
      ...windowOptions
    })

    load(sideTray, frame)

    sideTray.on('ready-to-show', () => {
      show(sideTray)
    })

    return sideTray
  }
}
