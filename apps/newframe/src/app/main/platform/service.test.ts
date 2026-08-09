import { describe, expect, it, mock } from 'bun:test'

import { createTestStore } from '../../../../test/support/createTestStore'
import { createPlatformService } from './service'

describe('platform service', () => {
  it('owns passive state and trusted platform effects without returning domain data', () => {
    const store = createTestStore({
      main: {
        frames: {},
        knownExtensions: {},
        networks: { ethereum: { 1: { id: 1, type: 'ethereum' } } },
        updater: { dontRemind: [] }
      },
      tray: { homeCommand: { id: 7, view: 'home', data: {} } },
      view: {
        badge: { type: 'updateAvailable', version: '2.0.0' },
        notifications: {
          notice: { id: 'notice', state: 'pending', createdAt: 1, updatedAt: 1 }
        },
        notify: 'extensionConnect',
        notifyData: { id: 'extension-a' }
      }
    })
    const quit = mock()
    const writeText = mock()
    const dismissUpdate = mock()
    const fetchUpdate = mock()
    const quitAndInstall = mock()
    const close = mock()
    const handleTrayMouseout = mock()
    const inspect = mock()
    const refocusSideTray = mock()
    const openBlockExplorer = mock()
    const openExternal = mock()
    const account = {
      address: '0x1111111111111111111111111111111111111111',
      getRequest: (id: string) => (id === 'request-1' ? { type: 'transaction' } : undefined)
    }
    const service = createPlatformService({
      accounts: { current: () => account },
      app: { quit },
      clipboard: { writeText },
      openBlockExplorer,
      openExternal,
      store: store.store,
      updater: { dismissUpdate, fetchUpdate, quitAndInstall, updateReady: true },
      windows: { close, handleTrayMouseout, inspect, refocusSideTray }
    })
    const event = { sender: { id: 1 } } as unknown as Pick<Electron.IpcMainInvokeEvent, 'sender'>

    expect(service.consumeHomeCommand(8)).toBeFalse()
    expect(service.consumeHomeCommand(7)).toBeTrue()
    expect(store.getState().tray.homeCommand).toBeNull()
    expect(service.updateNotification('missing', 'dismiss')).toBeFalse()
    expect(service.updateNotification('notice', 'dismiss')).toBeTrue()
    expect(store.getState().view.notifications.notice.hidden).toBeTrue()
    expect(service.openRequestPanel('missing')).toBeFalse()
    expect(service.openRequestPanel('request-1')).toBeTrue()
    expect(store.getState().windows.panel.nav[0]).toMatchObject({
      view: 'requestView',
      data: { accountId: account.address, requestId: 'request-1' }
    })

    expect(service.respondToExtension('other-extension', true)).toBeFalse()
    expect(service.respondToExtension('extension-a', true)).toBeTrue()
    expect(store.getState().main.knownExtensions['extension-a']).toBeTrue()
    expect(store.getState().view).toMatchObject({ notify: '', notifyData: {} })
    store.getState().notify('extensionConnect', { id: 'extension-b' })
    expect(service.respondToExtension('extension-b', false)).toBeTrue()
    expect(store.getState().main.knownExtensions['extension-b']).toBeFalse()

    expect(service.openSideTray({ type: 'sidetray.open', feature: 'trade', chainId: 99 })).toBeFalse()
    expect(service.openSideTray({ type: 'sidetray.open', feature: 'send' })).toBeTrue()
    expect(store.getState().main.frames).toHaveProperty('sideTray')
    expect(service.openSideTray({ type: 'sidetray.open', feature: 'send' })).toBeTrue()
    expect(refocusSideTray.mock.calls).toEqual([['sideTray']])
    expect(service.openTransactionExplorer(99)).toBeFalse()
    expect(service.openTransactionExplorer(1, '0xabc')).toBeTrue()

    service.respondToUpdater('skip')
    service.quitApp()
    service.writeClipboard('copied')
    service.openExternal('https://newframe.sh')
    service.closeSideTray(event)
    service.inspectRenderer(event, 12, 34)
    service.handleTrayMouseout()

    expect(store.getState().main.updater.dontRemind).toContain('2.0.0')
    expect({
      close: close.mock.calls,
      clipboard: writeText.mock.calls,
      dismissed: dismissUpdate.mock.calls,
      explorer: openBlockExplorer.mock.calls,
      external: openExternal.mock.calls,
      inspect: inspect.mock.calls,
      mouseout: handleTrayMouseout.mock.calls,
      quit: quit.mock.calls
    }).toEqual({
      close: [[event]],
      clipboard: [['copied']],
      dismissed: [[]],
      explorer: [[{ id: 1, type: 'ethereum' }, '0xabc']],
      external: [['https://newframe.sh']],
      inspect: [[event, 12, 34]],
      mouseout: [[]],
      quit: [[]]
    })
    expect(fetchUpdate.mock.calls).toEqual([])
    expect(quitAndInstall.mock.calls).toEqual([])
  })
})
