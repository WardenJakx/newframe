import { pathToFileURL } from 'url'

import { authorizeRenderer, registerRenderer } from '../../../main/ipc/authorization'

let nextId = 1

function renderer(entrypoint: 'tray' | 'dash' | 'dapp', clientType: 'wallet-ui' | 'dapp') {
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
      webContentsId: wallet.webContents.id
    })
  })

  it('rejects subframes and unexpected renderer URLs', () => {
    const wallet = renderer('dash', 'wallet-ui')
    wallet.frame.parent = {}
    expect(authorizeRenderer(wallet.event)).toBeUndefined()

    wallet.frame.parent = null
    wallet.frame.url = pathToFileURL('/app/bundle/dapp.html').toString()
    expect(authorizeRenderer(wallet.event)).toBeUndefined()
  })

  it('removes a registration when its WebContents is destroyed', () => {
    const dapp = renderer('dapp', 'dapp')
    dapp.destroy()

    expect(authorizeRenderer(dapp.event)).toBeUndefined()
  })

  it('only accepts the exact development entrypoint on the local app server', () => {
    process.env.NODE_ENV = 'development'
    const dapp = renderer('dapp', 'dapp')
    dapp.frame.url = 'http://localhost:1234/dapp/index.dev.html#/send'

    expect(authorizeRenderer(dapp.event)).toMatchObject({
      clientType: 'dapp',
      entrypoint: 'dapp'
    })

    dapp.frame.url = 'http://localhost:1234/tray/index.dev.html'
    expect(authorizeRenderer(dapp.event)).toBeUndefined()
  })
})
