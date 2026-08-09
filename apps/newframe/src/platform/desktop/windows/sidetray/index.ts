// The side tray hosts internal tools. `main.frames` describes the content it loads;
// it does not own the Electron lifecycle.
import { shallow } from 'zustand/vanilla/shallow'
import type canonicalStore from '../../../state-store/index.js'

import sideTrayHost, { SideTray } from './window.js'
import type { RendererAuthorizationRegistry } from '../../../ipc/main/authorization.js'

export default class SideTrayManager {
  private sideTrays: Record<string, SideTray> = {}
  private registerRenderer?: RendererAuthorizationRegistry['registerRenderer']

  constructor(private readonly store: typeof canonicalStore) {}

  private getFrames(): Record<string, Frame> {
    return this.store.getState().main.frames
  }

  start(registerRenderer: RendererAuthorizationRegistry['registerRenderer']) {
    this.registerRenderer = registerRenderer
    const manageCurrentFrames = ([frames, inFocus]: [Record<string, Frame>, string]) => {
      this.manageFrames(frames, inFocus)
    }
    const selectFrames = () =>
      [this.getFrames(), this.store.getState().main.focusedFrame] as [Record<string, Frame>, string]

    manageCurrentFrames(selectFrames())
    this.store.subscribe(
      (state) => [state.main.frames, state.main.focusedFrame] as [Record<string, Frame>, string],
      manageCurrentFrames,
      { equalityFn: shallow }
    )
  }

  manageFrames(frames: Record<string, Frame>, inFocus: string) {
    const frameIds = Object.keys(frames)
    const instanceIds = Object.keys(this.sideTrays)

    // create an instance for each new frame in the store
    frameIds
      .filter((frameId) => !instanceIds.includes(frameId))
      .forEach((frameId) => {
        if (!this.registerRenderer) {
          throw new Error('Renderer authorization must be configured before creating a side tray')
        }
        const sideTray = sideTrayHost.create(frames[frameId], this.registerRenderer)

        this.sideTrays[frameId] = sideTray

        sideTray.on('closed', () => {
          this.removeSideTray(frameId)
          this.store.getState().removeFrame(frameId)
        })

        sideTray.on('focus', () => sideTray.webContents.focus())
      })

    frameIds
      .filter((frameId) => instanceIds.includes(frameId))
      .forEach((frameId) => {
        const sideTray = this.sideTrays[frameId]
        const route = frames[frameId].route || ''

        if (sideTray && !sideTray.isDestroyed() && sideTray.contentRoute !== route) {
          sideTrayHost.load(sideTray, frames[frameId])
        }
      })

    // destroy each frame instance that is no longer in the store
    instanceIds
      .filter((instanceId) => !frameIds.includes(instanceId))
      .forEach((instanceId) => {
        const sideTray = this.removeSideTray(instanceId)

        if (sideTray) {
          sideTray.destroy()
        }
      })

    if (inFocus) {
      const focusedSideTray = this.sideTrays[inFocus] || { isFocused: () => true }

      if (!focusedSideTray.isFocused()) {
        focusedSideTray.show()
        focusedSideTray.focus()
      }
    }
  }

  removeSideTray(frameId: string) {
    const sideTray = this.sideTrays[frameId]

    delete this.sideTrays[frameId]

    if (sideTray) {
      sideTray.removeAllListeners('closed')
    }

    return sideTray
  }

  refocus(id: string) {
    const sideTray = this.sideTrays[id]
    if (sideTray) {
      const frame = this.getFrames()[id]
      sideTray.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true,
        skipTransformProcessType: true
      })
      sideTray.setVisibleOnAllWorkspaces(false, {
        visibleOnFullScreen: true,
        skipTransformProcessType: true
      })
      if (frame) {
        sideTrayHost.show(sideTray)
      } else {
        sideTray.show()
        sideTray.focus()
      }
    }
  }

  showAll() {
    const frames = this.getFrames()

    Object.keys(this.sideTrays).forEach((frameId) => {
      const sideTray = this.sideTrays[frameId]
      const frame = frames[frameId]

      if (sideTray && frame && !sideTray.isDestroyed()) {
        sideTrayHost.show(sideTray)
      }
    })
  }

  hideAll() {
    Object.keys(this.sideTrays).forEach((frameId) => {
      const sideTray = this.sideTrays[frameId]

      if (sideTray && !sideTray.isDestroyed() && sideTray.isVisible()) {
        sideTray.hide()
      }
    })
  }

  isShowing() {
    return Object.keys(this.sideTrays).some((id) => this.sideTrays[id].isVisible())
  }
}
