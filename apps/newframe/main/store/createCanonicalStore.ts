import log from 'electron-log'
import { createStore } from 'zustand/vanilla'
import { persist, subscribeWithSelector, type PersistStorage } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

import createCanonicalActions, { type CanonicalStore } from './actions'
import { mergePersistedState, migratePersistedState, selectPersistedState } from './persistence'
import {
  CANONICAL_STATE_STORAGE_NAME,
  PERSISTENCE_VERSION,
  type PersistedCanonicalState
} from './persist/schema'
import createInitialState from './state'

export default function createCanonicalStore(storage: PersistStorage<PersistedCanonicalState, void>) {
  let hydrationError: unknown
  const finishHydration = (success: boolean) => {
    if ('finishHydration' in storage && typeof storage.finishHydration === 'function') {
      storage.finishHydration(success)
    }
  }
  const store = createStore<CanonicalStore>()(
    subscribeWithSelector(
      persist(
        immer((set, get) => ({
          ...createInitialState(),
          ...createCanonicalActions(set, get)
        })),
        {
          name: CANONICAL_STATE_STORAGE_NAME,
          storage,
          partialize: selectPersistedState,
          version: PERSISTENCE_VERSION,
          migrate: migratePersistedState,
          merge: mergePersistedState,
          onRehydrateStorage: () => (_state, error) => {
            hydrationError = error
            if (error) log.error('Canonical state hydration failed', error)
          },
          skipHydration: true
        }
      )
    )
  )

  const hydration = Promise.resolve(store.persist.rehydrate()).then(() => {
    if (hydrationError) {
      finishHydration(false)
      throw hydrationError
    }

    finishHydration(true)
  })

  return { hydration, store }
}
