import { beforeEach, describe, expect, it, mock } from 'bun:test'
import { pathToFileURL } from 'url'

import type { IpcMainInvokeEvent, WebContents, WebFrameMain } from 'electron'

import { createRendererAuthorizationRegistry, type RendererAuthorizationRegistry } from './authorization.ts'

let nextId = 1
let authorization: RendererAuthorizationRegistry

function renderer(
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

  registry.registerRenderer(webContents, clientType, entrypoint)

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
  authorization = createRendererAuthorizationRegistry()
})

describe('renderer authorization', () => {
  it('derives the registered role from Electron-owned WebContents identity', () => {
    const wallet = renderer('tray', 'main-tray')
    const result = authorization.authorizeRenderer(wallet.event)

    expect(result).toMatchObject({
      clientType: 'main-tray',
      entrypoint: 'tray',
      webContentsId: wallet.webContents.id
    })
    expect(typeof result?.windowInstanceId).toBe('string')
  })

  it('rejects subframes and unexpected renderer URLs', () => {
    const wallet = renderer('tray', 'main-tray')
    wallet.frame.parent = {} as unknown as WebFrameMain
    expect(authorization.authorizeRenderer(wallet.event)).toBeUndefined()

    wallet.frame.parent = null
    wallet.frame.url = pathToFileURL('/app/bundle/side-tray.html').toString()
    expect(authorization.authorizeRenderer(wallet.event)).toBeUndefined()
  })

  it('removes a registration when its WebContents is destroyed', () => {
    const sideTray = renderer('side-tray', 'side-tray')
    sideTray.destroy()

    expect(authorization.authorizeRenderer(sideTray.event)).toBeUndefined()
  })

  it('only accepts the exact development entrypoint on the local app server', () => {
    process.env.NODE_ENV = 'development'
    const sideTray = renderer('side-tray', 'side-tray')
    sideTray.frame.url = 'http://localhost:1234/side-tray/index.dev.html#/send'

    expect(authorization.authorizeRenderer(sideTray.event)).toMatchObject({
      clientType: 'side-tray',
      entrypoint: 'side-tray'
    })

    sideTray.frame.url = 'http://localhost:1234/tray/index.dev.html'
    expect(authorization.authorizeRenderer(sideTray.event)).toBeUndefined()
  })

  it('keeps registrations isolated across registries and clears them on dispose', () => {
    const other = createRendererAuthorizationRegistry()
    const wallet = renderer('tray', 'main-tray')

    expect(other.authorizeRenderer(wallet.event)).toBeUndefined()
    expect(authorization.authorizeRenderer(wallet.event)).toBeDefined()

    authorization.dispose()

    expect(authorization.authorizeRenderer(wallet.event)).toBeUndefined()
  })
})
