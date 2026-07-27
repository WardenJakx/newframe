import { beforeEach, mock } from 'bun:test'
import log from 'electron-log'

import { electronMock, resetStoreMockImplementation, storeMock } from './bun.mocks'
import './test.setup.ts'
import './toMatchPath'

log.transports.file.level = false

const persistMock = {
  clear: mock(),
  flush: mock()
}
const windowsMock = {
  broadcast: mock(),
  browserWindows: mock(() => ({ panel: undefined })),
  showTray: mock()
}
const navMock = {
  forward: mock(),
  on: mock()
}

mock.module('electron', () => ({ default: electronMock, ...electronMock }))
mock.module('../../main/store/persist', () => ({ default: persistMock, ...persistMock }))
mock.module('../../main/store', () => ({ default: storeMock, ...storeMock }))
mock.module('../../main/windows', () => ({ default: windowsMock, ...windowsMock }))
mock.module('../../main/windows/nav', () => ({ default: navMock, ...navMock }))

beforeEach(() => {
  mock.clearAllMocks()
  resetStoreMockImplementation()
})
