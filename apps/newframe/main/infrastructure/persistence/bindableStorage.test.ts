import { describe, expect, it } from 'bun:test'

import { createBindablePersistenceStorage } from './bindableStorage'
import type { PersistenceStoragePort } from './ports'

class MemoryStorage implements PersistenceStoragePort {
  readonly values = new Map<string, unknown>()

  clear() {
    this.values.clear()
  }

  delete(key: string) {
    return this.values.delete(key)
  }

  get(key: string) {
    return this.values.get(key)
  }

  set(key: string, value: unknown) {
    this.values.set(key, value)
  }
}

describe('bindable persistence storage', () => {
  it('fails closed until a storage boundary is configured', () => {
    const storage = createBindablePersistenceStorage()

    expect(() => storage.get('wallet')).toThrow('Canonical persistence storage has not been configured.')
  })

  it('delegates the complete storage protocol after binding', () => {
    const target = new MemoryStorage()
    const storage = createBindablePersistenceStorage()
    storage.bind(target)

    storage.set('wallet', { version: 4 })
    const stored = storage.get('wallet')
    const deleted = storage.delete('wallet')
    storage.set('temporary', true)
    storage.clear()

    expect({
      stored,
      deleted,
      values: [...target.values.entries()]
    }).toStrictEqual({
      stored: { version: 4 },
      deleted: true,
      values: []
    })
  })

  it('rejects rebinding so the canonical storage authority cannot change at runtime', () => {
    const storage = createBindablePersistenceStorage()
    storage.bind(new MemoryStorage())

    expect(() => storage.bind(new MemoryStorage())).toThrow(
      'Canonical persistence storage has already been configured.'
    )
  })

  it('rejects an incomplete external storage implementation at the binding boundary', () => {
    const storage = createBindablePersistenceStorage()

    expect(() => storage.bind({ get: () => undefined } as never)).toThrow(
      'Canonical persistence storage does not implement the required port.'
    )
  })
})
