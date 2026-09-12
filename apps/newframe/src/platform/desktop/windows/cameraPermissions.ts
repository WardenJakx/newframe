import type { Session } from 'electron'

import type { RendererAuthorizationRegistry } from '../../ipc/main/authorization.js'

type PermissionSession = Pick<Session, 'setPermissionCheckHandler' | 'setPermissionRequestHandler'>
const installations = new WeakMap<PermissionSession, symbol>()

export function installCameraPermissions(
  session: PermissionSession,
  registry: Pick<RendererAuthorizationRegistry, 'authorizeMedia'>
) {
  const owner = Symbol('tray camera permissions')
  installations.set(session, owner)
  const trusted = (input: Parameters<RendererAuthorizationRegistry['authorizeMedia']>[0]) => {
    const identity = registry.authorizeMedia(input)
    return identity?.clientType === 'wallet-ui' && identity.entrypoint === 'tray'
  }
  session.setPermissionCheckHandler(
    (webContents, permission, _origin, details) =>
      permission === 'media' &&
      details.mediaType === 'video' &&
      trusted({
        webContents,
        requestingUrl: details.requestingUrl,
        isMainFrame: details.isMainFrame
      })
  )
  session.setPermissionRequestHandler((webContents, permission, callback, details) => {
    callback(
      permission === 'media' &&
        'mediaTypes' in details &&
        details.mediaTypes?.length === 1 &&
        details.mediaTypes[0] === 'video' &&
        trusted({
          webContents,
          requestingUrl: details.requestingUrl,
          isMainFrame: details.isMainFrame
        })
    )
  })
  return () => {
    if (installations.get(session) !== owner) return
    installations.delete(session)
    session.setPermissionCheckHandler(() => false)
    session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
  }
}
