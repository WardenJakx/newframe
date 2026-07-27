import { assertPersistenceStoragePort, type PersistenceStoragePort } from './ports'

export interface BindablePersistenceStorage extends PersistenceStoragePort {
  bind(storage: PersistenceStoragePort): void
}

export function createBindablePersistenceStorage(): BindablePersistenceStorage {
  let target: PersistenceStoragePort | undefined

  const current = () => {
    if (!target) throw new Error('Canonical persistence storage has not been configured.')
    return target
  }

  return {
    bind(storage) {
      if (target) throw new Error('Canonical persistence storage has already been configured.')
      assertPersistenceStoragePort(storage)
      target = storage
    },
    clear: () => current().clear(),
    delete: (key) => current().delete(key),
    get: (key) => current().get(key),
    set: (key, value) => current().set(key, value)
  }
}
