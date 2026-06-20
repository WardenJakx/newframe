import { beforeEach, jest, mock } from 'bun:test'
import log from 'electron-log'

import {
  electronMock,
  navMock,
  persistMock,
  resetStoreMockImplementation,
  storeMock,
  windowsMock
} from './bun.mocks'
import './test.setup'
import './toMatchPath'

log.transports.file.level = false

mock.module('electron', () => ({ default: electronMock, ...electronMock }))
mock.module('../main/store/persist', () => ({ default: persistMock, ...persistMock }))
mock.module('../main/store', () => ({ default: storeMock, ...storeMock }))
mock.module('../main/windows', () => ({ default: windowsMock, ...windowsMock }))
mock.module('../main/windows/nav', () => ({ default: navMock, ...navMock }))

beforeEach(() => {
  jest.clearAllMocks()
  resetStoreMockImplementation()
  jest.useFakeTimers()
})
