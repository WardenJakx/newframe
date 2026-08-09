import { CANONICAL_STATE_STORAGE_NAME } from './schema.js'
import type { PersistenceAdapter } from '../../persistence/index.js'

export type { PersistedCanonicalState } from './schema.js'
export { PERSISTENCE_VERSION } from './schema.js'
export {
  CanonicalStatePersistenceError,
  createPersistenceAdapter
} from '../../persistence/index.js'

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
