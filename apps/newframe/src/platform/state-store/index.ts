import log from 'electron-log'

import { createBindablePersistenceStorage } from '../persistence/bindableStorage.js'
import {
  createPersistenceAdapter,
  createPersistenceService,
  type PersistenceLifecycle,
  type PersistenceSchedulerPort,
  type PersistenceStoragePort
} from '../persistence/index.js'
import createCanonicalStore from './createCanonicalStore.js'
import { connectPersistenceControl } from './persist/index.js'

const persistenceStorage = createBindablePersistenceStorage()
const persistenceAdapter = createPersistenceAdapter({
  storage: persistenceStorage,
  clock: { now: () => Date.now() },
  logger: log
})
connectPersistenceControl(persistenceAdapter)

const canonical = createCanonicalStore(persistenceAdapter)
const store = canonical.store

if (process.env.NEWFRAME_VISUAL_HARNESS === 'true' && process.env.FRAME_PROFILE === 'dev') {
  Object.defineProperty(globalThis, '__NEWFRAME_VISUAL_HARNESS_GET_STATE__', {
    configurable: false,
    value: () => {
      const { main, operations, windows } = store.getState()
      return JSON.parse(JSON.stringify({ main, operations, windows }))
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
  if (persistenceService) throw new Error('Canonical persistence has already been configured.')

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

export type { CanonicalActions, CanonicalStore } from './actions.js'
export { default as createCanonicalStore } from './createCanonicalStore.js'
export default store
