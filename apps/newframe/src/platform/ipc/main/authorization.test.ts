import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { pathToFileURL } from 'url'

import type { IpcMainInvokeEvent, WebContents, WebFrameMain } from 'electron'

import { createTrayAuthorizationRegistry, type TrayAuthorizationRegistry } from './authorization.ts'

let nextId = 1
let authorization: TrayAuthorizationRegistry

function tray(
  entrypoint: 'tray' | 'side-tray',
  clientType: 'main-tray' | 'side-tray',
  registry = authorization
) {
  const frame: { parent: WebFrameMain | null; url: string } = {
    parent: null,
    url: pathToFileURL(`/app/bundle/${entrypoint}.html`).toString()
  }
  let destroyed: (() => void) | undefined
  const webContents = {
    id: nextId++,
    isDestroyed: mock(() => false),
    mainFrame: frame as unknown as WebFrameMain,
    once: mock((event: string, handler: () => void) => {
      if (event === 'destroyed') {
        destroyed = handler
      }
    })
  } as unknown as WebContents
  const event = {
    sender: webContents,
    senderFrame: frame as unknown as WebFrameMain
  } as unknown as IpcMainInvokeEvent

  registry.registerTray(webContents, clientType, entrypoint)

  return {
    destroy: () => destroyed?.(),
    event,
    frame,
    webContents
  }
}

beforeEach(() => {
  process.env.NODE_ENV = 'test'
  process.env.BUNDLE_LOCATION = '/app/bundle'
  authorization = createTrayAuthorizationRegistry()
})

describe('tray authorization', () => {
  it('derives the registered role from Electron-owned WebContents identity', () => {
    const wallet = tray('tray', 'main-tray')
    const result = authorization.authorizeTray(wallet.event)

    expect(result).toMatchObject({
      clientType: 'main-tray',
      entrypoint: 'tray',
      webContentsId: wallet.webContents.id
    })
    expect(typeof result?.windowInstanceId).toBe('string')
  })

  it('rejects subframes and unexpected tray URLs', () => {
    const wallet = tray('tray', 'main-tray')
    wallet.frame.parent = {} as unknown as WebFrameMain
    expect(authorization.authorizeTray(wallet.event)).toBeUndefined()

    wallet.frame.parent = null
    wallet.frame.url = pathToFileURL('/app/bundle/side-tray.html').toString()
    expect(authorization.authorizeTray(wallet.event)).toBeUndefined()
  })

  it('removes a registration when its WebContents is destroyed', () => {
    const sideTray = tray('side-tray', 'side-tray')
    sideTray.destroy()

    expect(authorization.authorizeTray(sideTray.event)).toBeUndefined()
  })

  it('only accepts the exact development entrypoint on the local app server', () => {
    process.env.NODE_ENV = 'development'
    const sideTray = tray('side-tray', 'side-tray')
    sideTray.frame.url = 'http://localhost:1234/side-tray/index.dev.html#/send'

    expect(authorization.authorizeTray(sideTray.event)).toMatchObject({
      clientType: 'side-tray',
      entrypoint: 'side-tray'
    })

    sideTray.frame.url = 'http://localhost:1234/tray/index.dev.html'
    expect(authorization.authorizeTray(sideTray.event)).toBeUndefined()
  })

  it('keeps registrations isolated across registries and clears them on dispose', () => {
    const other = createTrayAuthorizationRegistry()
    const wallet = tray('tray', 'main-tray')

    expect(other.authorizeTray(wallet.event)).toBeUndefined()
    expect(authorization.authorizeTray(wallet.event)).toBeDefined()

    authorization.dispose()

    expect(authorization.authorizeTray(wallet.event)).toBeUndefined()
  })
})
