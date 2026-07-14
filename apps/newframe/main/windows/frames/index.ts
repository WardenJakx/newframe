// Frames are the windows that run internal tools.
// They are rendered based on the state of `main.frames`
import { shallow } from 'zustand/vanilla/shallow'
import store from '../../store'

import frameInstances, { FrameInstance } from './frameInstances.js'

function getFrames(): Record<string, Frame> {
  return store.getState().main.frames
}

export default class FrameManager {
  private frameInstances: Record<string, FrameInstance> = {}

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
    const instanceIds = Object.keys(this.frameInstances)

    // create an instance for each new frame in the store
    frameIds
      .filter((frameId) => !instanceIds.includes(frameId))
      .forEach((frameId) => {
        const frameInstance = frameInstances.create(frames[frameId])

        this.frameInstances[frameId] = frameInstance

        frameInstance.on('closed', () => {
          this.removeFrameInstance(frameId)
          store.getState().removeFrame(frameId)
        })

        frameInstance.on('maximize', () => {
          store.getState().updateFrame(frameId, { maximized: true })
        })

        frameInstance.on('unmaximize', () => {
          store.getState().updateFrame(frameId, { maximized: false })
        })

        frameInstance.on('enter-full-screen', () => {
          store.getState().updateFrame(frameId, { fullscreen: true })
        })

        frameInstance.on('leave-full-screen', () => {
          const platform = store.getState().platform
          // Handle broken linux window events
          if (platform !== 'win32' && platform !== 'darwin' && !frameInstance.isFullScreen()) {
            if (frameInstance.isMaximized()) {
              store.getState().updateFrame(frameId, { maximized: true })
            } else {
              store.getState().updateFrame(frameId, { maximized: false })
            }
          } else {
            store.getState().updateFrame(frameId, { fullscreen: false })
          }
        })

        frameInstance.on('focus', () => frameInstance.webContents.focus())
      })

    frameIds
      .filter((frameId) => instanceIds.includes(frameId))
      .forEach((frameId) => {
        const frameInstance = this.frameInstances[frameId]
        const route = frames[frameId].route || ''

        if (frameInstance && !frameInstance.isDestroyed() && frameInstance.frameRoute !== route) {
          frameInstances.load(frameInstance, frames[frameId])
        }
      })

    // destroy each frame instance that is no longer in the store
    instanceIds
      .filter((instanceId) => !frameIds.includes(instanceId))
      .forEach((instanceId) => {
        const frameInstance = this.removeFrameInstance(instanceId)

        if (frameInstance) {
          frameInstance.destroy()
        }
      })

    if (inFocus) {
      const focusedFrame = this.frameInstances[inFocus] || { isFocused: () => true }

      if (!focusedFrame.isFocused()) {
        focusedFrame.show()
        focusedFrame.focus()
      }
    }
  }

  removeFrameInstance(frameId: string) {
    const frameInstance = this.frameInstances[frameId]

    delete this.frameInstances[frameId]

    if (frameInstance) {
      frameInstance.removeAllListeners('closed')
    }

    return frameInstance
  }

  refocus(id: string) {
    const frameInstance = this.frameInstances[id]
    if (frameInstance) {
      const frame = getFrames()[id]
      frameInstance.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true,
        skipTransformProcessType: true
      })
      frameInstance.setVisibleOnAllWorkspaces(false, {
        visibleOnFullScreen: true,
        skipTransformProcessType: true
      })
      if (frame) {
        frameInstances.show(frameInstance, frame)
      } else {
        frameInstance.show()
        frameInstance.focus()
      }
    }
  }

  showAll() {
    const frames = getFrames()

    Object.keys(this.frameInstances).forEach((frameId) => {
      const frameInstance = this.frameInstances[frameId]
      const frame = frames[frameId]

      if (frameInstance && frame && !frameInstance.isDestroyed()) {
        frameInstances.show(frameInstance, frame)
      }
    })
  }

  hideAll() {
    Object.keys(this.frameInstances).forEach((frameId) => {
      const frameInstance = this.frameInstances[frameId]

      if (frameInstance && !frameInstance.isDestroyed() && frameInstance.isVisible()) {
        frameInstance.hide()
      }
    })
  }

  isFrameShowing() {
    return Object.keys(this.frameInstances).some((win) => this.frameInstances[win].isVisible())
  }
}
