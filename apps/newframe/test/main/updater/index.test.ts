import { EventEmitter } from 'events'
import { afterEach, beforeAll, beforeEach, expect, it, jest, mock, spyOn } from 'bun:test'

import { storeMock } from '../../bun.mocks'

const STARTUP_CHECK_DELAY = 10_000
const DAY_MS = 24 * 60 * 60_000

const autoCheckForUpdates = jest.fn()
const autoClose = jest.fn()
const manualCheck = jest.fn(async () => undefined)
let now = 0
const testStore = storeMock as typeof storeMock & { __resetState: () => void }

class AutoUpdaterMock extends EventEmitter {
  checkForUpdates = autoCheckForUpdates
  close = autoClose
  downloadUpdate = jest.fn()
  quitAndInstall = jest.fn()
}

mock.module('../../../main/updater/autoUpdater', () => ({ default: AutoUpdaterMock }))
mock.module('../../../main/updater/manualCheck', () => ({ default: manualCheck }))

let updater: typeof import('../../../main/updater').default

function checkCount() {
  return autoCheckForUpdates.mock.calls.length + manualCheck.mock.calls.length
}

function resetUpdaterTest() {
  updater.stop()
  testStore.__resetState()
  autoCheckForUpdates.mockClear()
  autoClose.mockClear()
  manualCheck.mockClear()
}

beforeAll(async () => {
  updater = (await import('../../../main/updater')).default
})

beforeEach(() => {
  jest.useFakeTimers()
  now = Date.parse('2026-01-01T00:00:00.000Z')
  spyOn(Date, 'now').mockImplementation(() => now)
  resetUpdaterTest()
})

afterEach(() => {
  updater.stop()
  jest.restoreAllMocks()
})

it('runs the first update check after the startup delay when no daily check has run', () => {
  updater.start()

  jest.advanceTimersByTime(STARTUP_CHECK_DELAY - 1)

  expect(checkCount()).toBe(0)

  now += STARTUP_CHECK_DELAY
  jest.advanceTimersByTime(1)

  expect(checkCount()).toBe(1)
  expect(storeMock('main.updater.lastChecked')).toBe(Date.now())
})

it('waits until the next daily window when an update check already ran today', () => {
  const checkedAt = Date.now()

  storeMock.set('main.updater.lastChecked', checkedAt)

  updater.start()

  jest.advanceTimersByTime(STARTUP_CHECK_DELAY)

  expect(checkCount()).toBe(0)

  now = checkedAt + DAY_MS - 1
  jest.advanceTimersByTime(DAY_MS - STARTUP_CHECK_DELAY - 1)

  expect(checkCount()).toBe(0)

  now = checkedAt + DAY_MS
  jest.advanceTimersByTime(1)

  expect(checkCount()).toBe(1)
  expect(storeMock('main.updater.lastChecked')).toBe(checkedAt + DAY_MS)
})
