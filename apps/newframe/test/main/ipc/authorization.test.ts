import { pathToFileURL } from 'url'

import { authorizeRenderer, registerRenderer } from '../../../main/ipc/authorization'

let nextId = 1

function renderer(entrypoint: 'tray' | 'sidetray', clientType: 'wallet-ui' | 'sidetray') {
  const frame: any = {
    parent: null,
    url: pathToFileURL(`/app/bundle/${entrypoint}.html`).toString()
  }
  let destroyed: (() => void) | undefined
  const webContents: any = {
    id: nextId++,
    isDestroyed: jest.fn(() => false),
    mainFrame: frame,
    once: jest.fn((event: string, handler: () => void) => {
      if (event === 'destroyed') destroyed = handler
    })
  }

  registerRenderer(webContents, clientType, entrypoint)

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
})

describe('renderer authorization', () => {
  it('derives the registered role from Electron-owned WebContents identity', () => {
    const wallet = renderer('tray', 'wallet-ui')

    expect(authorizeRenderer(wallet.event)).toEqual({
      clientType: 'wallet-ui',
      entrypoint: 'tray',
      webContentsId: wallet.webContents.id,
      windowInstanceId: expect.any(String)
    })
  })

  it('rejects subframes and unexpected renderer URLs', () => {
    const wallet = renderer('tray', 'wallet-ui')
    wallet.frame.parent = {}
    expect(authorizeRenderer(wallet.event)).toBeUndefined()

    wallet.frame.parent = null
    wallet.frame.url = pathToFileURL('/app/bundle/sidetray.html').toString()
    expect(authorizeRenderer(wallet.event)).toBeUndefined()
  })

  it('removes a registration when its WebContents is destroyed', () => {
    const sideTray = renderer('sidetray', 'sidetray')
    sideTray.destroy()

    expect(authorizeRenderer(sideTray.event)).toBeUndefined()
  })

  it('only accepts the exact development entrypoint on the local app server', () => {
    process.env.NODE_ENV = 'development'
    const sideTray = renderer('sidetray', 'sidetray')
    sideTray.frame.url = 'http://localhost:1234/sidetray/index.dev.html#/send'

    expect(authorizeRenderer(sideTray.event)).toMatchObject({
      clientType: 'sidetray',
      entrypoint: 'sidetray'
    })

    sideTray.frame.url = 'http://localhost:1234/tray/index.dev.html'
    expect(authorizeRenderer(sideTray.event)).toBeUndefined()
  })
})
