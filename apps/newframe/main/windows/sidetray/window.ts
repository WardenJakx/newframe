import electron, { BrowserWindow } from 'electron'
import path from 'path'

import { createWindow } from '../window'
import { constrainTraySize, sideTrayPosition } from '../trayGeometry'

const isDev = process.env.NODE_ENV === 'development'

export interface SideTray extends BrowserWindow {
  contentRoute?: string
}

const placeSideTray = (sideTray: SideTray) => {
  const area = electron.screen.getDisplayNearestPoint(electron.screen.getCursorScreenPoint()).workArea

  if (process.platform !== 'darwin') {
    sideTray.setAlwaysOnTop(true)
  }
  sideTray.setMovable(false)
  constrainTraySize(sideTray, area.height)
  const { x, y } = sideTrayPosition(area)
  sideTray.setPosition(x, y)
}

const routeHash = (route?: string) => {
  return route && route.startsWith('/') ? `#${route}` : ''
}

const frameUrl = (frame: Frame) => {
  const baseUrl = isDev
    ? 'http://localhost:1234/sidetray/index.dev.html'
    : `file://${process.env.BUNDLE_LOCATION}/sidetray.html`

  return `${baseUrl}${routeHash(frame.route)}`
}

const load = (sideTray: SideTray, frame: Frame) => {
  sideTray.contentRoute = frame.route || ''
  placeSideTray(sideTray)
  sideTray.loadURL(frameUrl(frame))
}

const show = (sideTray: SideTray) => {
  placeSideTray(sideTray)
  sideTray.show()
  sideTray.focus()
}

export default {
  load,
  show,
  create: (frame: Frame) => {
    const windowOptions: Electron.BrowserWindowConstructorOptions = {
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      icon: path.join(__dirname, './AppIcon.png')
    }

    if (process.platform === 'darwin') {
      windowOptions.type = 'panel'
    }

    const sideTray: SideTray = createWindow('sidetray', {
      ...windowOptions
    })

    load(sideTray, frame)

    sideTray.on('ready-to-show', () => {
      show(sideTray)
    })

    return sideTray
  }
}
