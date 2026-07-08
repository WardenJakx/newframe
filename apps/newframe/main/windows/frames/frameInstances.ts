import electron, { BrowserWindow } from 'electron'
import path from 'path'

import { createWindow } from '../window'
import topRight from './topRight'

const isDev = process.env.NODE_ENV === 'development'
const fullheight = !!process.env.FULL_HEIGHT
const secondaryPanelWidth = 400
const secondaryPanelGap = 5
const devHeight = 800
const secondaryPanelPresentation = 'secondaryPanel'

export interface FrameInstance extends BrowserWindow {
  frameId?: string
  frameRoute?: string
}

const isSecondaryPanelFrame = (frame: Frame) => frame.presentation === secondaryPanelPresentation

const secondaryPanelHeight = () => {
  const area = electron.screen.getDisplayNearestPoint(electron.screen.getCursorScreenPoint()).workArea

  return isDev && !fullheight ? devHeight : area.height
}

const placeSecondaryPanel = (frameInstance: FrameInstance) => {
  const area = electron.screen.getDisplayNearestPoint(electron.screen.getCursorScreenPoint()).workArea
  const height = secondaryPanelHeight()
  const x = Math.max(area.x, Math.floor(area.x + area.width - secondaryPanelWidth * 2 - secondaryPanelGap))

  if (process.platform !== 'darwin') {
    frameInstance.setAlwaysOnTop(true)
  }
  frameInstance.setResizable(false)
  frameInstance.setMovable(false)
  frameInstance.setMinimumSize(secondaryPanelWidth, height)
  frameInstance.setSize(secondaryPanelWidth, height)
  frameInstance.setMaximumSize(secondaryPanelWidth, height)
  frameInstance.setPosition(x, area.y)
}

const placeFloatingFrame = (frameInstance: FrameInstance) => {
  const area = electron.screen.getDisplayNearestPoint(electron.screen.getCursorScreenPoint()).workArea
  const height = area.height - 160
  const maxWidth = Math.floor(height * 1.24)
  const targetWidth = area.width - 460
  const width = targetWidth > maxWidth ? maxWidth : targetWidth
  frameInstance.setMinimumSize(400, 300)
  frameInstance.setSize(width, height)
  const pos = topRight(frameInstance)
  frameInstance.setPosition(pos.x - 440, pos.y + 80)
}

const place = (frameInstance: FrameInstance, frame: Frame) => {
  if (isSecondaryPanelFrame(frame)) {
    placeSecondaryPanel(frameInstance)
  } else {
    placeFloatingFrame(frameInstance)
  }
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
  place(frameInstance, frame)
  frameInstance.loadURL(frameUrl(frame))
}

const show = (frameInstance: FrameInstance, frame: Frame) => {
  place(frameInstance, frame)
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

    if (isSecondaryPanelFrame(frame)) {
      if (process.platform === 'darwin') {
        windowOptions.type = 'panel'
      }
    } else {
      windowOptions.titleBarStyle = 'hidden'
      windowOptions.trafficLightPosition = { x: 10, y: 9 }
    }

    const frameInstance: FrameInstance = createWindow('frameInstance', {
      ...windowOptions
    })

    load(frameInstance, frame)

    frameInstance.on('ready-to-show', () => {
      show(frameInstance, frame)
    })

    frameInstance.frameId = frame.id

    return frameInstance
  }
}
