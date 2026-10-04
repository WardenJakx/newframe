// The side tray hosts internal tools. `main.frames` describes the content it loads;
// it does not own the Electron lifecycle.
import { shallow } from 'zustand/vanilla/shallow'

import type { TrayAuthorizationRegistry } from '../../../entry/tray/authorization.ts'
import type canonicalStore from '../../../state/store/index.ts'
import type { Frame } from '../../../state/store/state/index.ts'
import type { SideTray } from './window.ts'
import sideTrayHost from './window.ts'

export default class SideTrayManager {
  private sideTrays: Record<string, SideTray | undefined> = {}
  private registerTray?: TrayAuthorizationRegistry['registerTray']

  constructor(private readonly store: typeof canonicalStore) {}

  private getFrames(): Record<string, Frame | undefined> {
    return this.store.getState().main.frames
  }

  start(registerTray: TrayAuthorizationRegistry['registerTray']) {
    this.registerTray = registerTray
    const manageCurrentFrames = ([frames, inFocus]: [Record<string, Frame | undefined>, string]) => {
      this.manageFrames(frames, inFocus)
    }
    const selectFrames = () =>
      [this.getFrames(), this.store.getState().main.focusedFrame] as [
        Record<string, Frame | undefined>,
        string
      ]

    manageCurrentFrames(selectFrames())
    this.store.subscribe(
      (state) => [state.main.frames, state.main.focusedFrame] as [Record<string, Frame | undefined>, string],
      manageCurrentFrames,
      { equalityFn: shallow }
    )
  }

  manageFrames(frames: Record<string, Frame | undefined>, inFocus: string) {
    const frameIds = Object.keys(frames)
    const instanceIds = Object.keys(this.sideTrays)

    // create an instance for each new frame in the store
    frameIds
      .filter((frameId) => !instanceIds.includes(frameId))
      .forEach((frameId) => {
        const frame = frames[frameId]
        if (!frame) {
          return
        }
        if (!this.registerTray) {
          throw new Error('Tray authorization must be configured before creating a side tray')
        }
        const sideTray = sideTrayHost.create(frame, this.registerTray)

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
        const frame = frames[frameId]
        if (!frame) {
          return
        }
        const route = frame.route ?? ''

        if (sideTray && !sideTray.isDestroyed() && sideTray.contentRoute !== route) {
          sideTrayHost.load(sideTray, frame)
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
      const focusedSideTray = this.sideTrays[inFocus]

      if (focusedSideTray && !focusedSideTray.isFocused()) {
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
    return Object.keys(this.sideTrays).some((id) => this.sideTrays[id]?.isVisible() ?? false)
  }
}
