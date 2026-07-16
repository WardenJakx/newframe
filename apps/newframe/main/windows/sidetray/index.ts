// The side tray owns windows for internal tools. `main.frames` describes the
// content loaded into those windows; it does not own their Electron lifecycle.
import { shallow } from 'zustand/vanilla/shallow'
import store from '../../store'

import sideTrayWindow, { SideTrayWindow } from './window.js'

function getFrames(): Record<string, Frame> {
  return store.getState().main.frames
}

export default class SideTrayManager {
  private windows: Record<string, SideTrayWindow> = {}

  start() {
    const manageCurrentFrames = ([frames, inFocus]: [Record<string, Frame>, string]) => {
      this.manageFrames(frames, inFocus)
    }
    const selectFrames = () =>
      [getFrames(), store.getState().main.focusedFrame] as [Record<string, Frame>, string]

    manageCurrentFrames(selectFrames())
    store.subscribe(
      (state) => [state.main.frames, state.main.focusedFrame] as [Record<string, Frame>, string],
      manageCurrentFrames,
      { equalityFn: shallow }
    )
  }

  manageFrames(frames: Record<string, Frame>, inFocus: string) {
    const frameIds = Object.keys(frames)
    const instanceIds = Object.keys(this.windows)

    // create an instance for each new frame in the store
    frameIds
      .filter((frameId) => !instanceIds.includes(frameId))
      .forEach((frameId) => {
        const sideTray = sideTrayWindow.create(frames[frameId])

        this.windows[frameId] = sideTray

        sideTray.on('closed', () => {
          this.removeSideTrayWindow(frameId)
          store.getState().removeFrame(frameId)
        })

        sideTray.on('focus', () => sideTray.webContents.focus())
      })

    frameIds
      .filter((frameId) => instanceIds.includes(frameId))
      .forEach((frameId) => {
        const sideTray = this.windows[frameId]
        const route = frames[frameId].route || ''

        if (sideTray && !sideTray.isDestroyed() && sideTray.contentRoute !== route) {
          sideTrayWindow.load(sideTray, frames[frameId])
        }
      })

    // destroy each frame instance that is no longer in the store
    instanceIds
      .filter((instanceId) => !frameIds.includes(instanceId))
      .forEach((instanceId) => {
        const sideTray = this.removeSideTrayWindow(instanceId)

        if (sideTray) {
          sideTray.destroy()
        }
      })

    if (inFocus) {
      const focusedFrame = this.windows[inFocus] || { isFocused: () => true }

      if (!focusedFrame.isFocused()) {
        focusedFrame.show()
        focusedFrame.focus()
      }
    }
  }

  removeSideTrayWindow(frameId: string) {
    const sideTray = this.windows[frameId]

    delete this.windows[frameId]

    if (sideTray) {
      sideTray.removeAllListeners('closed')
    }

    return sideTray
  }

  refocus(id: string) {
    const sideTray = this.windows[id]
    if (sideTray) {
      const frame = getFrames()[id]
      sideTray.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true,
        skipTransformProcessType: true
      })
      sideTray.setVisibleOnAllWorkspaces(false, {
        visibleOnFullScreen: true,
        skipTransformProcessType: true
      })
      if (frame) {
        sideTrayWindow.show(sideTray)
      } else {
        sideTray.show()
        sideTray.focus()
      }
    }
  }

  showAll() {
    const frames = getFrames()

    Object.keys(this.windows).forEach((frameId) => {
      const sideTray = this.windows[frameId]
      const frame = frames[frameId]

      if (sideTray && frame && !sideTray.isDestroyed()) {
        sideTrayWindow.show(sideTray)
      }
    })
  }

  hideAll() {
    Object.keys(this.windows).forEach((frameId) => {
      const sideTray = this.windows[frameId]

      if (sideTray && !sideTray.isDestroyed() && sideTray.isVisible()) {
        sideTray.hide()
      }
    })
  }

  isShowing() {
    return Object.keys(this.windows).some((win) => this.windows[win].isVisible())
  }
}
