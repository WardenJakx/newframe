import electron, { BrowserWindow } from 'electron'
import path from 'path'

import { createWindow } from '../window'
import { constrainPanelSize, sidePanelPosition } from '../panelGeometry'

const isDev = process.env.NODE_ENV === 'development'

export interface FrameInstance extends BrowserWindow {
  frameId?: string
  frameRoute?: string
}

const placePanel = (frameInstance: FrameInstance) => {
  const area = electron.screen.getDisplayNearestPoint(electron.screen.getCursorScreenPoint()).workArea

  if (process.platform !== 'darwin') {
    frameInstance.setAlwaysOnTop(true)
  }
  frameInstance.setMovable(false)
  constrainPanelSize(frameInstance, area.height)
  const { x, y } = sidePanelPosition(area)
  frameInstance.setPosition(x, y)
}

const routeHash = (route?: string) => {
  return route && route.startsWith('/') ? `#${route}` : ''
}

const frameUrl = (frame: Frame) => {
  const baseUrl = isDev
    ? 'http://localhost:1234/dapp/index.dev.html'
    : `file://${process.env.BUNDLE_LOCATION}/dapp.html`

  return `${baseUrl}${routeHash(frame.route)}`
}

const load = (frameInstance: FrameInstance, frame: Frame) => {
  frameInstance.frameRoute = frame.route || ''
  placePanel(frameInstance)
  frameInstance.loadURL(frameUrl(frame))
}

const show = (frameInstance: FrameInstance) => {
  placePanel(frameInstance)
  frameInstance.show()
  frameInstance.focus()
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

    const frameInstance: FrameInstance = createWindow('frameInstance', {
      ...windowOptions
    })

    load(frameInstance, frame)

    frameInstance.on('ready-to-show', () => {
      show(frameInstance)
    })

    frameInstance.frameId = frame.id

    return frameInstance
  }
}
