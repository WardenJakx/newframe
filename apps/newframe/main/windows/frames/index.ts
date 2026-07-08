// Frames are the windows that run internal tools.
// They are rendered based on the state of `main.frames`
import log from 'electron-log'
import store from '../../store'

import frameInstances, { FrameInstance } from './frameInstances.js'

function getFrames(): Record<string, Frame> {
  return store('main.frames')
}

export default class FrameManager {
  private frameInstances: Record<string, FrameInstance> = {}

  start() {
    store.observer(() => {
      const inFocus = store('main.focusedFrame')

      const frames = getFrames()

      this.manageFrames(frames, inFocus)
      // manageOverlays(frames)
    })
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
          store.removeFrame(frameId)
        })

        frameInstance.on('maximize', () => {
          store.updateFrame(frameId, { maximized: true })
        })

        frameInstance.on('unmaximize', () => {
          store.updateFrame(frameId, { maximized: false })
        })

        frameInstance.on('enter-full-screen', () => {
          store.updateFrame(frameId, { fullscreen: true })
        })

        frameInstance.on('leave-full-screen', () => {
          const platform = store('platform')
          // Handle broken linux window events
          if (platform !== 'win32' && platform !== 'darwin' && !frameInstance.isFullScreen()) {
            if (frameInstance.isMaximized()) {
              store.updateFrame(frameId, { maximized: true })
            } else {
              store.updateFrame(frameId, { maximized: false })
            }
          } else {
            store.updateFrame(frameId, { fullscreen: false })
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

  private sendMessageToFrame(frameId: string, channel: string, ...args: any) {
    const frameInstance = this.frameInstances[frameId]

    if (frameInstance && !frameInstance.isDestroyed()) {
      const webContents = frameInstance.webContents
      webContents.send(channel, ...args)
    } else {
      log.error(
        new Error(
          `Tried to send a message to frame with id ${frameId} but it does not exist or has been destroyed`
        )
      )
    }
  }

  broadcast(channel: string, args: any[]) {
    Object.keys(this.frameInstances).forEach((id) => this.sendMessageToFrame(id, channel, ...args))
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
