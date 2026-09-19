import log from 'electron-log'
import { persist, subscribeWithSelector, type PersistStorage } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import { createStore } from 'zustand/vanilla'

import { createCanonicalActions, type CanonicalStore } from './actions.js'
import {
  CANONICAL_STATE_STORAGE_NAME,
  PERSISTENCE_VERSION,
  type PersistedCanonicalState
} from './persist/schema.js'
import { mergePersistedState, migratePersistedState, selectPersistedState } from './persistence.js'
import createInitialState from './state/index.js'

export default function createCanonicalStore(storage: PersistStorage<PersistedCanonicalState, void>) {
  let hydrationError: unknown
  let hydration: Promise<void> | undefined
  const finishHydration = (success: boolean) => {
    const hydratableStorage = storage as PersistStorage<PersistedCanonicalState> & {
      finishHydration?(success: boolean): void
    }
    if (typeof hydratableStorage.finishHydration === 'function') {
      hydratableStorage.finishHydration(success)
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
            if (error) {
              log.error('Canonical state hydration failed', error)
            }
          },
          skipHydration: true
        }
      )
    )
  )

  const hydrate = () => {
    if (hydration) {
      return hydration
    }

    hydration = Promise.resolve(store.persist.rehydrate()).then(() => {
      if (hydrationError) {
        finishHydration(false)
        throw hydrationError instanceof Error
          ? hydrationError
          : new Error('Canonical state hydration failed', { cause: hydrationError })
      }

      finishHydration(true)
    })

    return hydration
  }

  return { hydrate, store }
}
