import type { BrowserWindow } from 'electron'

export const PANEL_WIDTH = 400
export const PANEL_GAP = 5

const DEV_PANEL_HEIGHT = 800
const isDev = process.env.NODE_ENV === 'development'
const fullHeight = !!process.env.FULL_HEIGHT

type PanelWindow = Pick<BrowserWindow, 'setMaximumSize' | 'setMinimumSize' | 'setResizable' | 'setSize'>

type WorkArea = {
  x: number
  y: number
  width: number
}

export function panelHeight(workAreaHeight: number) {
  return isDev && !fullHeight ? DEV_PANEL_HEIGHT : workAreaHeight
}

export function constrainPanelSize(window: PanelWindow, workAreaHeight: number) {
  const height = panelHeight(workAreaHeight)

  window.setResizable(false)
  window.setMinimumSize(PANEL_WIDTH, height)
  window.setSize(PANEL_WIDTH, height)
  window.setMaximumSize(PANEL_WIDTH, height)
}

export function mainPanelPosition(area: WorkArea) {
  return {
    x: Math.floor(area.x + area.width - PANEL_WIDTH),
    y: area.y
  }
}

export function sidePanelPosition(area: WorkArea) {
  const mainPanel = mainPanelPosition(area)

  return {
    x: Math.max(area.x, mainPanel.x - PANEL_WIDTH - PANEL_GAP),
    y: area.y
  }
}
