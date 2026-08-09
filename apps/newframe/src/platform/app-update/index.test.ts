import { beforeAll, beforeEach, expect, it, mock } from 'bun:test'

import { resetStoreState, storeMock } from '../../../test/support/bun.mocks.ts'

let updater: import('./index').Updater

beforeAll(async () => {
  const { Updater } = await import('./index')
  updater = new Updater(storeMock)
})

beforeEach(() => {
  resetStoreState()
  mock.restore()
})

it('does not schedule repository release checks for the unsigned MVP', () => {
  const initialState = storeMock.getState().main.updater

  updater.start()

  expect(storeMock.getState().main.updater).toEqual(initialState)
  expect(storeMock.getState().view.badge).toBeFalsy()
  expect(updater.updateReady).toBe(false)
})

it('keeps every update action inert', () => {
  updater.fetchUpdate()
  updater.quitAndInstall()
  updater.dismissUpdate()
  updater.stop()

  expect(storeMock.getState().view.badge).toBeFalsy()
  expect(updater.updateReady).toBe(false)
})
