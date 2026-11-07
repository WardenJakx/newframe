import type { PersistStorage, StorageValue } from 'zustand/middleware'

import {
  PersistedEnvelopeSchema,
  PERSISTENCE_VERSION,
  StoredEnvelopeSchema,
  type PersistedCanonicalState
} from '../store/persist/schema.ts'
import type { PersistenceClockPort, PersistenceLoggerPort, PersistenceStoragePort } from './ports.ts'

type PendingWrite = {
  key: string
  value: StorageValue<PersistedCanonicalState>
}

export class CanonicalStatePersistenceError extends Error {
  constructor(
    readonly code: 'invalid_state' | 'unsupported_version',
    message: string
  ) {
    super(message)
    this.name = 'CanonicalStatePersistenceError'
  }
}

export interface PersistenceAdapter extends PersistStorage<PersistedCanonicalState, void> {
  finishHydration(success: boolean, error?: unknown): void
  flush(): void
  clear(): void
}

export interface PersistenceAdapterDependencies {
  storage: PersistenceStoragePort
  clock: PersistenceClockPort
  logger?: PersistenceLoggerPort
  maxSupportedVersion?: number
}

const silentLogger: PersistenceLoggerPort = {
  error: () => undefined
}

export function createPersistenceAdapter({
  storage,
  clock,
  logger = silentLogger,
  maxSupportedVersion = PERSISTENCE_VERSION
}: PersistenceAdapterDependencies): PersistenceAdapter {
  let pending: PendingWrite | undefined
  // Writes reach storage only once ready; blocked is final.
  let phase: 'hydrating' | 'ready' | 'blocked' = 'hydrating'
  // Older-version state is only validated by migration, after getItem returns it.
  let migrating: { key: string; value: unknown } | undefined

  const storageKey = (name: string) => `zustand.${name}`

  const quarantine = (key: string, value: unknown, reason: unknown) => {
    const quarantineKey = `${key}.invalid.${clock.now()}`
    logger.error('Quarantined invalid canonical state persistence', {
      key,
      quarantineKey,
      reason
    })

    // Never remove the original unless the recovery copy was written successfully.
    storage.set(quarantineKey, value)
    storage.delete(key)
  }

  const adapter: PersistenceAdapter = {
    getItem(name) {
      const key = storageKey(name)
      const stored = storage.get(key)
      if (stored === undefined) {
        return null
      }

      const parsed = StoredEnvelopeSchema.safeParse(stored)
      if (!parsed.success) {
        quarantine(key, stored, parsed.error.issues)
        throw new CanonicalStatePersistenceError('invalid_state', 'Canonical wallet state is malformed.')
      }

      if (parsed.data.version > maxSupportedVersion) {
        phase = 'blocked'
        logger.error('Refused to load a newer canonical state persistence version', {
          storedVersion: parsed.data.version,
          maxSupportedVersion
        })
        throw new CanonicalStatePersistenceError(
          'unsupported_version',
          'Canonical wallet state was created by a newer Newframe version.'
        )
      }

      if (parsed.data.version === maxSupportedVersion) {
        const current = PersistedEnvelopeSchema.safeParse(parsed.data)
        if (!current.success) {
          quarantine(key, stored, current.error.issues)
          throw new CanonicalStatePersistenceError('invalid_state', 'Canonical wallet state is malformed.')
        }

        return current.data
      }

      migrating = { key, value: stored }
      return parsed.data as StorageValue<PersistedCanonicalState>
    },

    setItem(name, value) {
      if (phase === 'blocked') {
        return
      }

      const parsed = PersistedEnvelopeSchema.safeParse(value)
      if (!parsed.success) {
        logger.error('Refused to persist invalid canonical state', parsed.error.issues)
        return
      }
      if (parsed.data.version !== maxSupportedVersion) {
        logger.error('Refused to persist an unsupported canonical state version', parsed.data.version)
        return
      }

      pending = {
        key: storageKey(name),
        value: structuredClone(parsed.data)
      }
    },

    removeItem(name) {
      pending = undefined
      storage.delete(storageKey(name))
    },

    finishHydration(success, error) {
      const migrated = migrating
      migrating = undefined
      if (!success) {
        pending = undefined
        phase = 'blocked'
        if (migrated && error instanceof CanonicalStatePersistenceError && error.code === 'invalid_state') {
          quarantine(migrated.key, migrated.value, error.message)
        }
        return
      }

      if (phase === 'hydrating') {
        phase = 'ready'
      }
      adapter.flush()
    },

    flush() {
      if (phase !== 'ready' || !pending) {
        return
      }

      const write = pending
      storage.set(write.key, write.value)
      if (pending === write) {
        pending = undefined
      }
    },

    clear() {
      pending = undefined
      phase = 'blocked'
      storage.clear()
    }
  }

  return adapter
}
