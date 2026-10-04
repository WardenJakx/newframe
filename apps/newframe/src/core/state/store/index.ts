import log from 'electron-log'

import { isVisualHarness } from '../../desktop-ui/runtime/visualHarness.ts'
import { createBindablePersistenceStorage } from '../storage/bindableStorage.ts'
import {
  createPersistenceAdapter,
  createPersistenceService,
  type PersistenceLifecycle,
  type PersistenceSchedulerPort,
  type PersistenceStoragePort
} from '../storage/index.ts'
import createCanonicalStore from './createCanonicalStore.ts'
import { connectPersistenceControl } from './persist/index.ts'

const persistenceStorage = createBindablePersistenceStorage()
const persistenceAdapter = createPersistenceAdapter({
  storage: persistenceStorage,
  clock: { now: () => Date.now() },
  logger: log
})
connectPersistenceControl(persistenceAdapter)

const canonical = createCanonicalStore(persistenceAdapter)
const store = canonical.store

if (isVisualHarness) {
  Object.defineProperty(globalThis, '__NEWFRAME_VISUAL_HARNESS_GET_STATE__', {
    configurable: false,
    value: () => {
      const { main, operations, windows, view } = store.getState()
      return JSON.parse(
        JSON.stringify({ main, operations, windows, view: { notifications: view.notifications } })
      ) as unknown
    },
    writable: false
  })
}

export interface CanonicalPersistenceDependencies {
  storage: PersistenceStoragePort
  scheduler: PersistenceSchedulerPort
}

let persistenceService: PersistenceLifecycle | undefined

export function createCanonicalPersistenceService({ storage, scheduler }: CanonicalPersistenceDependencies) {
  if (persistenceService) {
    throw new Error('Canonical persistence has already been configured.')
  }

  persistenceStorage.bind(storage)
  persistenceService = createPersistenceService({
    adapter: persistenceAdapter,
    hydrate: canonical.hydrate,
    scheduler,
    onScheduledFlushError: (error) => {
      log.error('Could not flush canonical state persistence', error)
    }
  })

  return persistenceService
}

export type { CanonicalActions, CanonicalStore } from './actions.ts'
export { default as createCanonicalStore } from './createCanonicalStore.ts'
export default store
