import { EventEmitter } from 'events'
import { beforeAll, expect, it } from 'bun:test'

import { electronMock } from '../../bun.mocks'

type OnTrayRendererReady = (webContents: Pick<EventEmitter, 'off' | 'once'>, ready: () => void) => () => void

let onTrayRendererReady: OnTrayRendererReady
let registeredRendererReadyIpc = false

beforeAll(async () => {
  Object.assign(electronMock.app, {
    getLoginItemSettings: () => ({ wasOpenedAtLogin: false })
  })

  const implementationPath = '../../../main/windows/index.ts?lifecycle-test'
  const implementation = (await import(implementationPath)) as {
    onTrayRendererReady: OnTrayRendererReady
  }
  onTrayRendererReady = implementation.onTrayRendererReady
  registeredRendererReadyIpc = electronMock.ipcMain.on.mock.calls.some(
    ([channel]) => channel === 'tray:ready'
  )
})

it('does not register renderer-controlled tray readiness IPC', () => {
  expect(registeredRendererReadyIpc).toBe(false)
})

it('runs tray readiness once from the Electron load lifecycle', () => {
  const webContents = new EventEmitter()
  let readyCount = 0

  onTrayRendererReady(webContents, () => {
    readyCount += 1
  })
  webContents.emit('did-finish-load')
  webContents.emit('did-finish-load')

  expect(readyCount).toBe(1)
})

it('removes tray readiness when its window is destroyed before load', () => {
  const webContents = new EventEmitter()
  let readyCount = 0

  const remove = onTrayRendererReady(webContents, () => {
    readyCount += 1
  })
  remove()
  webContents.emit('did-finish-load')

  expect(readyCount).toBe(0)
})
