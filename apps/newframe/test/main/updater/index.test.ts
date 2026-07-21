import { EventEmitter } from 'events'
import { afterEach, beforeAll, beforeEach, expect, it, jest as timers, mock, spyOn } from 'bun:test'

import { resetStoreState, storeMock } from '../../bun.mocks'

const STARTUP_CHECK_DELAY = 10_000
const DAY_MS = 24 * 60 * 60_000

const autoCheckForUpdates = mock()
const autoClose = mock()
const manualCheck = mock(async () => undefined)
let now = 0

class AutoUpdaterMock extends EventEmitter {
  checkForUpdates = autoCheckForUpdates
  close = autoClose
  downloadUpdate = mock()
  quitAndInstall = mock()
}

mock.module('../../../main/updater/autoUpdater', () => ({ default: AutoUpdaterMock }))
mock.module('../../../main/updater/manualCheck', () => ({ default: manualCheck }))

let updater: typeof import('../../../main/updater').default

function checkCount() {
  return autoCheckForUpdates.mock.calls.length + manualCheck.mock.calls.length
}

function resetUpdaterTest() {
  updater.stop()
  resetStoreState()
  autoCheckForUpdates.mockClear()
  autoClose.mockClear()
  manualCheck.mockClear()
}

beforeAll(async () => {
  updater = (await import('../../../main/updater')).default
})

beforeEach(() => {
  timers.useFakeTimers()
  now = Date.parse('2026-01-01T00:00:00.000Z')
  spyOn(Date, 'now').mockImplementation(() => now)
  resetUpdaterTest()
})

afterEach(() => {
  updater.stop()
  mock.restore()
  timers.useRealTimers()
})

it('runs the first update check after the startup delay when no daily check has run', () => {
  updater.start()

  timers.advanceTimersByTime(STARTUP_CHECK_DELAY - 1)

  expect(checkCount()).toBe(0)

  now += STARTUP_CHECK_DELAY
  timers.advanceTimersByTime(1)

  expect(checkCount()).toBe(1)
  expect(storeMock.getState().main.updater.lastChecked).toBe(Date.now())
})

it('waits until the next daily window when an update check already ran today', () => {
  const checkedAt = Date.now()

  storeMock.setState((state: any) => {
    state.main.updater.lastChecked = checkedAt
  })

  updater.start()

  timers.advanceTimersByTime(STARTUP_CHECK_DELAY)

  expect(checkCount()).toBe(0)

  now = checkedAt + DAY_MS - 1
  timers.advanceTimersByTime(DAY_MS - STARTUP_CHECK_DELAY - 1)

  expect(checkCount()).toBe(0)

  now = checkedAt + DAY_MS
  timers.advanceTimersByTime(1)

  expect(checkCount()).toBe(1)
  expect(storeMock.getState().main.updater.lastChecked).toBe(checkedAt + DAY_MS)
})
