import type { PersistenceAdapter } from '../../persistence/index.js'

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
