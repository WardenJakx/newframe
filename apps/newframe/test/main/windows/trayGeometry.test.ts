import { describe, expect, it, jest } from 'bun:test'

import {
  constrainTraySize,
  sideTrayPosition,
  TRAY_GAP,
  TRAY_WIDTH,
  trayHeight,
  trayPosition
} from '../../../main/windows/trayGeometry'

describe('tray geometry', () => {
  it('locks both trays to the shared dimensions', () => {
    const window = {
      setMaximumSize: jest.fn(),
      setMinimumSize: jest.fn(),
      setResizable: jest.fn(),
      setSize: jest.fn()
    }

    const height = trayHeight(900)
    constrainTraySize(window, 900)

    expect(window.setResizable).toHaveBeenCalledWith(false)
    expect(window.setMinimumSize).toHaveBeenCalledWith(TRAY_WIDTH, height)
    expect(window.setSize).toHaveBeenCalledWith(TRAY_WIDTH, height)
    expect(window.setMaximumSize).toHaveBeenCalledWith(TRAY_WIDTH, height)
  })

  it('places the side tray beside the tray', () => {
    const area = { x: 100, y: 20, width: 1440 }
    const tray = trayPosition(area)
    const sideTray = sideTrayPosition(area)

    expect(tray).toEqual({ x: 1140, y: 20 })
    expect(sideTray).toEqual({ x: tray.x - TRAY_WIDTH - TRAY_GAP, y: 20 })
  })
})
