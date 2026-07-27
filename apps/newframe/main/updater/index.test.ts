import { EventEmitter } from 'events'
import { afterEach, beforeAll, beforeEach, expect, it, jest as timers, mock, spyOn } from 'bun:test'

import { resetStoreState, storeMock } from '../../test/support/bun.mocks.ts'
import createCanonicalStore from '../store/createCanonicalStore'

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

mock.module('./autoUpdater', () => ({ default: AutoUpdaterMock }))
mock.module('./manualCheck', () => ({ default: manualCheck }))

let updater: import('./index').Updater

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
  const { Updater } = await import('./index')
  updater = new Updater(storeMock)
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

it('keeps update scheduling state isolated across two canonical graphs', async () => {
  const memoryStorage = {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined
  }
  const firstStore = createCanonicalStore(memoryStorage).store
  const secondStore = createCanonicalStore(memoryStorage).store
  const { Updater } = await import('./index')
  const first = new Updater(firstStore)
  const second = new Updater(secondStore)
  firstStore.getState().setUpdaterLastChecked(now)

  first.start()
  second.start()
  now += STARTUP_CHECK_DELAY
  timers.advanceTimersByTime(STARTUP_CHECK_DELAY)

  expect({
    checks: checkCount(),
    first: firstStore.getState().main.updater.lastChecked,
    second: secondStore.getState().main.updater.lastChecked
  }).toEqual({
    checks: 1,
    first: now - STARTUP_CHECK_DELAY,
    second: now
  })

  first.stop()
  second.stop()
})
