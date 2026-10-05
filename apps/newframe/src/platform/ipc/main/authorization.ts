import { randomUUID } from 'node:crypto'
import path from 'path'
import { fileURLToPath } from 'url'

import type { IpcMainInvokeEvent, WebContents } from 'electron'

export type TrayRole = 'main-tray' | 'side-tray'
export type TrayEntrypoint = 'tray' | 'side-tray'

type TrayRegistration = {
  webContents: WebContents
  clientType: TrayRole
  entrypoint: TrayEntrypoint
  windowInstanceId: string
}

export type AuthorizationContext = Pick<TrayRegistration, 'clientType' | 'entrypoint'> & {
  webContentsId: number
  windowInstanceId: string
}

export interface TrayAuthorizationRegistry {
  authorizeTray(event: IpcMainInvokeEvent): AuthorizationContext | undefined
  authorizeMedia(input: {
    webContents: WebContents | null
    requestingUrl: string | undefined
    isMainFrame: boolean
  }): AuthorizationContext | undefined
  registerTray(webContents: WebContents, clientType: TrayRole, entrypoint: TrayEntrypoint): void
  dispose(): void
}

const samePath = (left: string, right: string) => {
  const normalize = (value: string) => {
    const normalized = path.resolve(value)
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized
  }

  return normalize(left) === normalize(right)
}

function isAllowedTrayUrl(entrypoint: TrayEntrypoint, value: string) {
  try {
    const target = new URL(value)
    if (target.username || target.password || target.search) {
      return false
    }

    if (target.protocol === 'http:' && process.env.NODE_ENV === 'development') {
      return target.origin === 'http://localhost:1234' && target.pathname === `/${entrypoint}/index.dev.html`
    }

    if (target.protocol !== 'file:' || !process.env.BUNDLE_LOCATION) {
      return false
    }

    return samePath(fileURLToPath(target), path.join(process.env.BUNDLE_LOCATION, `${entrypoint}.html`))
  } catch {
    return false
  }
}

export function createTrayAuthorizationRegistry(
  createWindowInstanceId: () => string = randomUUID
): TrayAuthorizationRegistry {
  const trays = new Map<number, TrayRegistration>()

  return {
    registerTray(webContents, clientType, entrypoint) {
      const registration = {
        webContents,
        clientType,
        entrypoint,
        windowInstanceId: createWindowInstanceId()
      }
      trays.set(webContents.id, registration)

      webContents.once('destroyed', () => {
        if (trays.get(webContents.id) === registration) {
          trays.delete(webContents.id)
        }
      })
    },
    authorizeTray(event) {
      const registration = trays.get(event.sender.id)
      if (!registration || registration.webContents !== event.sender || event.sender.isDestroyed()) {
        return
      }

      const frame = event.senderFrame
      if (frame?.parent !== null || event.sender.mainFrame !== frame) {
        return
      }
      if (!isAllowedTrayUrl(registration.entrypoint, frame.url)) {
        return
      }

      return {
        clientType: registration.clientType,
        entrypoint: registration.entrypoint,
        webContentsId: event.sender.id,
        windowInstanceId: registration.windowInstanceId
      }
    },
    authorizeMedia({ webContents, requestingUrl, isMainFrame }) {
      if (!webContents || !isMainFrame || !requestingUrl || webContents.isDestroyed()) {
        return
      }
      const registration = trays.get(webContents.id)
      if (!registration || registration.webContents !== webContents) {
        return
      }
      const frame = webContents.mainFrame
      if (frame.parent !== null || frame.url !== requestingUrl) {
        return
      }
      if (!isAllowedTrayUrl(registration.entrypoint, requestingUrl)) {
        return
      }
      return {
        clientType: registration.clientType,
        entrypoint: registration.entrypoint,
        webContentsId: webContents.id,
        windowInstanceId: registration.windowInstanceId
      }
    },
    dispose() {
      trays.clear()
    }
  }
}
