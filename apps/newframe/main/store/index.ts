import log from 'electron-log'

import { createBindablePersistenceStorage } from '../infrastructure/persistence/bindableStorage'
import {
  createPersistenceAdapter,
  createPersistenceService,
  type PersistenceLifecycle,
  type PersistenceSchedulerPort,
  type PersistenceStoragePort
} from '../infrastructure/persistence'
import createCanonicalStore from './createCanonicalStore'
import { connectPersistenceControl } from './persist'

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
      const { main, windows } = store.getState()
      return JSON.parse(JSON.stringify({ main, windows }))
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

export type { CanonicalActions, CanonicalStore } from './actions'
export { default as createCanonicalStore } from './createCanonicalStore'
export default store
