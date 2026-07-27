import { CANONICAL_STATE_STORAGE_NAME } from './schema'
import type { PersistenceAdapter } from '../../infrastructure/persistence'

export type { PersistedCanonicalState } from './schema'
export { PERSISTENCE_VERSION } from './schema'
export { CanonicalStatePersistenceError, createPersistenceAdapter } from '../../infrastructure/persistence'

export { CANONICAL_STATE_STORAGE_NAME }

let activeAdapter: Pick<PersistenceAdapter, 'clear' | 'flush'> | undefined

export function connectPersistenceControl(adapter: Pick<PersistenceAdapter, 'clear' | 'flush'>) {
  activeAdapter = adapter
  return () => {
    if (activeAdapter === adapter) activeAdapter = undefined
  }
}

const persistenceControl = {
  clear() {
    activeAdapter?.clear()
  },
  flush() {
    activeAdapter?.flush()
  }
}

export default persistenceControl
