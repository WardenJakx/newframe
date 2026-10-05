import { beforeAll, expect, it } from 'bun:test'
import { EventEmitter } from 'events'

import { electronMock } from '../../../../test/support/electron.mock.ts'

type OnTrayReady = (webContents: Pick<EventEmitter, 'off' | 'once'>, ready: () => void) => () => void
type RevealExtensionApproval = (notification: unknown, reveal: () => void) => void

let onTrayReady: OnTrayReady
let revealExtensionApproval: RevealExtensionApproval
let registeredTrayReadyIpc = false

beforeAll(async () => {
  Object.assign(electronMock.app, {
    getLoginItemSettings: () => ({ wasOpenedAtLogin: false })
  })

  const implementationPath = './index.ts?lifecycle-test'
  const implementation = (await import(implementationPath)) as {
    onTrayReady: OnTrayReady
    revealExtensionApproval: RevealExtensionApproval
  }
  onTrayReady = implementation.onTrayReady
  revealExtensionApproval = implementation.revealExtensionApproval
  registeredTrayReadyIpc = electronMock.ipcMain.on.mock.calls.some(([channel]) => channel === 'tray:ready')
})

it('does not register tray-controlled tray readiness IPC', () => {
  expect(registeredTrayReadyIpc).toBe(false)
})

it('runs tray readiness once from the Electron load lifecycle', () => {
  const webContents = new EventEmitter()
  let readyCount = 0

  onTrayReady(webContents, () => {
    readyCount += 1
  })
  webContents.emit('did-finish-load')
  webContents.emit('did-finish-load')

  expect(readyCount).toBe(1)
})

it('removes tray readiness when its window is destroyed before load', () => {
  const webContents = new EventEmitter()
  let readyCount = 0

  const remove = onTrayReady(webContents, () => {
    readyCount += 1
  })
  remove()
  webContents.emit('did-finish-load')

  expect(readyCount).toBe(0)
})

it('reveals the tray only for extension approval requests', () => {
  let revealCount = 0
  const reveal = () => {
    revealCount += 1
  }

  revealExtensionApproval('success', reveal)
  revealExtensionApproval('', reveal)
  revealExtensionApproval('extensionConnect', reveal)

  expect(revealCount).toBe(1)
})
