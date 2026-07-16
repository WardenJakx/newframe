import path from 'path'
import { fileURLToPath } from 'url'

import type { IpcMainInvokeEvent, WebContents } from 'electron'

export type RendererRole = 'wallet-ui' | 'sidetray'
export type RendererEntrypoint = 'tray' | 'sidetray'

type RendererRegistration = {
  webContents: WebContents
  clientType: RendererRole
  entrypoint: RendererEntrypoint
}

export type AuthorizationContext = Pick<RendererRegistration, 'clientType' | 'entrypoint'> & {
  webContentsId: number
}

const renderers = new Map<number, RendererRegistration>()

const samePath = (left: string, right: string) => {
  const normalize = (value: string) => {
    const normalized = path.resolve(value)
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized
  }

  return normalize(left) === normalize(right)
}

export function isAllowedRendererUrl(entrypoint: RendererEntrypoint, value: string) {
  try {
    const target = new URL(value)
    if (target.username || target.password || target.search) return false

    if (target.protocol === 'http:' && process.env.NODE_ENV === 'development') {
      return target.origin === 'http://localhost:1234' && target.pathname === `/${entrypoint}/index.dev.html`
    }

    if (target.protocol !== 'file:' || !process.env.BUNDLE_LOCATION) return false

    return samePath(fileURLToPath(target), path.join(process.env.BUNDLE_LOCATION, `${entrypoint}.html`))
  } catch {
    return false
  }
}

export function registerRenderer(
  webContents: WebContents,
  clientType: RendererRole,
  entrypoint: RendererEntrypoint
) {
  const registration = { webContents, clientType, entrypoint }
  renderers.set(webContents.id, registration)

  webContents.once('destroyed', () => {
    if (renderers.get(webContents.id) === registration) renderers.delete(webContents.id)
  })
}

export function authorizeRenderer(event: IpcMainInvokeEvent): AuthorizationContext | undefined {
  const registration = renderers.get(event.sender.id)
  if (!registration || registration.webContents !== event.sender || event.sender.isDestroyed()) return

  const frame = event.senderFrame
  if (!frame || frame.parent !== null || event.sender.mainFrame !== frame) return
  if (!isAllowedRendererUrl(registration.entrypoint, frame.url)) return

  return {
    clientType: registration.clientType,
    entrypoint: registration.entrypoint,
    webContentsId: event.sender.id
  }
}
