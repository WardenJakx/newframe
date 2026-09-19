import { beforeAll, beforeEach, expect, it, mock } from 'bun:test'

import type { StoreApi } from 'zustand/vanilla'

import { resetStoreState, storeMock } from '../../../test/support/bun.mocks.ts'
import type { CanonicalStore } from '../state-store/actions.ts'

let updater: import('./index').Updater
const store = storeMock as unknown as StoreApi<CanonicalStore>

beforeAll(async () => {
  const { Updater } = await import('./index')
  updater = new Updater(storeMock as unknown as ConstructorParameters<typeof Updater>[0])
})

beforeEach(() => {
  resetStoreState()
  mock.restore()
})

it('does not schedule repository release checks for the unsigned MVP', () => {
  const initialState = store.getState().main.updater

  updater.start()

  expect(store.getState().main.updater).toEqual(initialState)
  expect(store.getState().view.badge).toBeFalsy()
  expect(updater.updateReady).toBe(false)
})

it('keeps every update action inert', () => {
  updater.fetchUpdate()
  updater.quitAndInstall()
  updater.dismissUpdate()
  updater.stop()

  expect(store.getState().view.badge).toBeFalsy()
  expect(updater.updateReady).toBe(false)
})
