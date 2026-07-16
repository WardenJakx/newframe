import { describe, expect, it, jest } from 'bun:test'

import {
  constrainPanelSize,
  mainPanelPosition,
  PANEL_GAP,
  PANEL_WIDTH,
  panelHeight,
  sidePanelPosition
} from '../../../main/windows/panelGeometry'

describe('panel geometry', () => {
  it('locks every shell panel to the shared dimensions', () => {
    const window = {
      setMaximumSize: jest.fn(),
      setMinimumSize: jest.fn(),
      setResizable: jest.fn(),
      setSize: jest.fn()
    }

    const height = panelHeight(900)
    constrainPanelSize(window, 900)

    expect(window.setResizable).toHaveBeenCalledWith(false)
    expect(window.setMinimumSize).toHaveBeenCalledWith(PANEL_WIDTH, height)
    expect(window.setSize).toHaveBeenCalledWith(PANEL_WIDTH, height)
    expect(window.setMaximumSize).toHaveBeenCalledWith(PANEL_WIDTH, height)
  })

  it('places dashboard and dapp windows in the same side-panel slot', () => {
    const area = { x: 100, y: 20, width: 1440 }
    const main = mainPanelPosition(area)
    const side = sidePanelPosition(area)

    expect(main).toEqual({ x: 1140, y: 20 })
    expect(side).toEqual({ x: main.x - PANEL_WIDTH - PANEL_GAP, y: 20 })
  })
})
