import { expect, it } from 'bun:test'

import type { Session, WebContents } from 'electron'

import { createRendererAuthorizationRegistry } from '../../ipc/main/authorization'
import { installCameraPermissions } from './cameraPermissions'

type PermissionSession = Parameters<typeof installCameraPermissions>[0]
function fixture() {
  process.env.BUNDLE_LOCATION = '/app/bundle'
  process.env.NODE_ENV = 'test'
  const registry = createRendererAuthorizationRegistry()
  let check!: NonNullable<Parameters<Session['setPermissionCheckHandler']>[0]>
  let request!: NonNullable<Parameters<Session['setPermissionRequestHandler']>[0]>
  const session: PermissionSession = {
    setPermissionCheckHandler: (handler) => {
      if (!handler) throw new Error('Must deny explicitly')
      check = handler
    },
    setPermissionRequestHandler: (handler) => {
      if (!handler) throw new Error('Must deny explicitly')
      request = handler
    }
  }
  let id = 0
  const renderer = (entrypoint: 'tray' | 'sidetray') => {
    const frame = { parent: null, url: `file:///app/bundle/${entrypoint}.html` }
    let destroyed = () => {}
    const webContents = {
      id: ++id,
      mainFrame: frame,
      isDestroyed: () => false,
      once: (_event: string, handler: () => void) => {
        destroyed = handler
      }
    } as unknown as WebContents
    registry.registerRenderer(webContents, entrypoint === 'tray' ? 'wallet-ui' : 'sidetray', entrypoint)
    return { webContents, frame, destroy: () => destroyed() }
  }
  const wallet = renderer('tray')
  const side = renderer('sidetray')
  const dispose = installCameraPermissions(session, registry)
  const details = { requestingUrl: wallet.frame.url, isMainFrame: true, mediaType: 'video' as const }
  const allowed = () => check(wallet.webContents, 'media', 'file://', details)
  const requested = (mediaTypes: Array<'video' | 'audio'> | undefined, overrides = {}) => {
    let result: boolean | undefined
    request(
      wallet.webContents,
      'media',
      (value) => {
        result = value
      },
      { ...details, mediaTypes, ...overrides }
    )
    return result
  }
  return {
    wallet,
    side,
    registry,
    session,
    dispose,
    allowed,
    requested,
    details,
    check: (...args: Parameters<typeof check>) => check(...args)
  }
}

it('allows only registered tray main-document video checks and requests', () => {
  const f = fixture()
  expect(f.allowed()).toBe(true)
  expect(f.requested(['video'])).toBe(true)
  for (const mediaType of ['audio', 'unknown', undefined] as const)
    expect(f.check(f.wallet.webContents, 'media', '', { ...f.details, mediaType })).toBe(false)
  for (const mediaTypes of [['audio'], ['video', 'audio'], [], undefined] as const)
    expect(f.requested(mediaTypes ? [...mediaTypes] : undefined)).toBe(false)
  for (const override of [
    { isMainFrame: false },
    { requestingUrl: undefined },
    { requestingUrl: 'file:///app/bundle/tray.html?evil' }
  ]) {
    expect(f.check(f.wallet.webContents, 'media', '', { ...f.details, ...override })).toBe(false)
    expect(f.requested(['video'], override)).toBe(false)
  }
  expect(f.check(null, 'media', '', f.details)).toBe(false)
  expect(f.check(f.side.webContents, 'media', '', { ...f.details, requestingUrl: f.side.frame.url })).toBe(
    false
  )
  expect(f.check(f.wallet.webContents, 'geolocation', '', f.details)).toBe(false)
  f.wallet.frame.url = 'https://example.com/'
  expect(f.allowed()).toBe(false)
  f.dispose()
})

it('leaves deny-all active for live side trays and prevents old disposal replacing a newer policy', () => {
  const f = fixture()
  const newer = installCameraPermissions(f.session, f.registry)
  f.dispose()
  expect(f.allowed()).toBe(true)
  newer()
  expect(f.allowed()).toBe(false)
  expect(f.requested(['video'])).toBe(false)
  expect(f.check(f.side.webContents, 'media', '', { ...f.details, requestingUrl: f.side.frame.url })).toBe(
    false
  )
})

it('rejects destroyed registrations and lookalike WebContents identities', () => {
  const f = fixture()
  // oxlint-disable-next-line typescript/no-misused-spread -- Deliberately drop the prototype to test a lookalike identity.
  expect(f.check({ ...f.wallet.webContents } as WebContents, 'media', '', f.details)).toBe(false)
  f.wallet.destroy()
  expect(f.allowed()).toBe(false)
  expect(f.requested(['video'])).toBe(false)
  f.dispose()
})
