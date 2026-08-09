import { beforeEach, describe, expect, it, mock } from 'bun:test'

import { pathToFileURL } from 'url'

import { createRendererAuthorizationRegistry, type RendererAuthorizationRegistry } from './authorization'

let nextId = 1
let authorization: RendererAuthorizationRegistry

function renderer(
  entrypoint: 'tray' | 'sidetray',
  clientType: 'wallet-ui' | 'sidetray',
  registry = authorization
) {
  const frame: any = {
    parent: null,
    url: pathToFileURL(`/app/bundle/${entrypoint}.html`).toString()
  }
  let destroyed: (() => void) | undefined
  const webContents: any = {
    id: nextId++,
    isDestroyed: mock(() => false),
    mainFrame: frame,
    once: mock((event: string, handler: () => void) => {
      if (event === 'destroyed') destroyed = handler
    })
  }

  registry.registerRenderer(webContents, clientType, entrypoint)

  return {
    destroy: () => destroyed?.(),
    event: { sender: webContents, senderFrame: frame } as any,
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
    const wallet = renderer('tray', 'wallet-ui')

    expect(authorization.authorizeRenderer(wallet.event)).toEqual({
      clientType: 'wallet-ui',
      entrypoint: 'tray',
      webContentsId: wallet.webContents.id,
      windowInstanceId: expect.any(String)
    })
  })

  it('rejects subframes and unexpected renderer URLs', () => {
    const wallet = renderer('tray', 'wallet-ui')
    wallet.frame.parent = {}
    expect(authorization.authorizeRenderer(wallet.event)).toBeUndefined()

    wallet.frame.parent = null
    wallet.frame.url = pathToFileURL('/app/bundle/sidetray.html').toString()
    expect(authorization.authorizeRenderer(wallet.event)).toBeUndefined()
  })

  it('removes a registration when its WebContents is destroyed', () => {
    const sideTray = renderer('sidetray', 'sidetray')
    sideTray.destroy()

    expect(authorization.authorizeRenderer(sideTray.event)).toBeUndefined()
  })

  it('only accepts the exact development entrypoint on the local app server', () => {
    process.env.NODE_ENV = 'development'
    const sideTray = renderer('sidetray', 'sidetray')
    sideTray.frame.url = 'http://localhost:1234/sidetray/index.dev.html#/send'

    expect(authorization.authorizeRenderer(sideTray.event)).toMatchObject({
      clientType: 'sidetray',
      entrypoint: 'sidetray'
    })

    sideTray.frame.url = 'http://localhost:1234/tray/index.dev.html'
    expect(authorization.authorizeRenderer(sideTray.event)).toBeUndefined()
  })

  it('keeps registrations isolated across registries and clears them on dispose', () => {
    const other = createRendererAuthorizationRegistry()
    const wallet = renderer('tray', 'wallet-ui')

    expect(other.authorizeRenderer(wallet.event)).toBeUndefined()
    expect(authorization.authorizeRenderer(wallet.event)).toBeDefined()

    authorization.dispose()

    expect(authorization.authorizeRenderer(wallet.event)).toBeUndefined()
  })
})
