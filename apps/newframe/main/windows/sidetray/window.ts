import electron, { BrowserWindow } from 'electron'
import path from 'path'

import { createWindow } from '../window'
import { constrainPanelSize, sidePanelPosition } from '../panelGeometry'

const isDev = process.env.NODE_ENV === 'development'

export interface SideTrayWindow extends BrowserWindow {
  contentRoute?: string
}

const placeSideTray = (sideTray: SideTrayWindow) => {
  const area = electron.screen.getDisplayNearestPoint(electron.screen.getCursorScreenPoint()).workArea

  if (process.platform !== 'darwin') {
    sideTray.setAlwaysOnTop(true)
  }
  sideTray.setMovable(false)
  constrainPanelSize(sideTray, area.height)
  const { x, y } = sidePanelPosition(area)
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

const load = (sideTray: SideTrayWindow, frame: Frame) => {
  sideTray.contentRoute = frame.route || ''
  placeSideTray(sideTray)
  sideTray.loadURL(frameUrl(frame))
}

const show = (sideTray: SideTrayWindow) => {
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

    const sideTray: SideTrayWindow = createWindow('sidetray', {
      ...windowOptions
    })

    load(sideTray, frame)

    sideTray.on('ready-to-show', () => {
      show(sideTray)
    })

    return sideTray
  }
}
