import { describe, expect, it, jest } from 'bun:test'

import { broadcastToWindows, sendToWindow, type BroadcastWindow } from '../../../main/windows/broadcast'

const createWindow = ({ destroyed = false, rendererDestroyed = false } = {}) => {
  const send = jest.fn()
  const window: BroadcastWindow = {
    isDestroyed: () => destroyed,
    webContents: {
      isDestroyed: () => rendererDestroyed,
      send
    }
  }

  return { send, window }
}

describe('window broadcasts', () => {
  it('sends to a live window', () => {
    const { send, window } = createWindow()

    expect(sendToWindow(window, 'main:action', 'stateSync')).toBe(true)
    expect(send).toHaveBeenCalledWith('main:action', 'stateSync')
  })

  it('ignores a closed window', () => {
    const { send, window } = createWindow({ destroyed: true })

    expect(sendToWindow(window, 'main:action', 'stateSync')).toBe(false)
    expect(send).not.toHaveBeenCalled()
  })

  it('ignores a window whose renderer has closed', () => {
    const { send, window } = createWindow({ rendererDestroyed: true })

    expect(sendToWindow(window, 'main:action', 'stateSync')).toBe(false)
    expect(send).not.toHaveBeenCalled()
  })

  it('continues a state broadcast when dash has closed', () => {
    const tray = createWindow()
    const dash = createWindow({ destroyed: true })

    broadcastToWindows({ tray: tray.window, dash: dash.window }, 'main:action', 'stateSync', '[]')

    expect(tray.send).toHaveBeenCalledWith('main:action', 'stateSync', '[]')
    expect(dash.send).not.toHaveBeenCalled()
  })
})
