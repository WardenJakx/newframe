import type { BrowserWindow } from 'electron'

export const TRAY_WIDTH = 400
export const TRAY_GAP = 5

const DEV_TRAY_HEIGHT = 800
const isDev = process.env.NODE_ENV === 'development'
const fullHeight = !!process.env.FULL_HEIGHT

type TrayWindow = Pick<BrowserWindow, 'setMaximumSize' | 'setMinimumSize' | 'setResizable' | 'setSize'>

type WorkArea = {
  x: number
  y: number
  width: number
}

export function trayHeight(workAreaHeight: number) {
  return isDev && !fullHeight ? DEV_TRAY_HEIGHT : workAreaHeight
}

export function constrainTraySize(window: TrayWindow, workAreaHeight: number) {
  const height = trayHeight(workAreaHeight)

  window.setResizable(false)
  window.setMinimumSize(TRAY_WIDTH, height)
  window.setSize(TRAY_WIDTH, height)
  window.setMaximumSize(TRAY_WIDTH, height)
}

export function trayPosition(area: WorkArea) {
  return {
    x: Math.floor(area.x + area.width - TRAY_WIDTH),
    y: area.y
  }
}

export function sideTrayPosition(area: WorkArea) {
  const tray = trayPosition(area)

  return {
    x: Math.max(area.x, tray.x - TRAY_WIDTH - TRAY_GAP),
    y: area.y
  }
}
