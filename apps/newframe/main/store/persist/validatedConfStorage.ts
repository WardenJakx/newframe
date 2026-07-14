import log from 'electron-log'

import type { PersistStorage, StorageValue } from 'zustand/middleware'
import {
  PersistedEnvelopeSchema,
  PERSISTENCE_VERSION,
  StoredEnvelopeSchema,
  type PersistedCanonicalState
} from './schema'

export type ConfAccess = {
  clear(): void
  delete(key: string): unknown
  get(key: string): unknown
  set(key: string, value: unknown): unknown
}

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

export class ValidatedConfStorage implements PersistStorage<PersistedCanonicalState, void> {
  private pending?: PendingWrite
  private hydrating = true
  private writesBlocked = false

  constructor(
    private readonly conf: ConfAccess,
    private readonly maxSupportedVersion = PERSISTENCE_VERSION
  ) {}

  private storageKey(name: string) {
    return `zustand.${name}`
  }

  private readLegacyState(): StorageValue<PersistedCanonicalState> | null {
    const legacyRoot = this.conf.get('main') as { __?: Record<string, { main?: unknown }> } | undefined
    const versions = Object.keys(legacyRoot?.__ || {})
      .map(Number)
      .filter(Number.isInteger)
      .sort((left, right) => right - left)
    const legacyVersions = legacyRoot?.__
    const legacyMain = versions.length ? legacyVersions?.[String(versions[0])]?.main : undefined
    if (!legacyMain) return null

    return { state: { main: legacyMain } as PersistedCanonicalState, version: 0 }
  }

  private quarantine(key: string, value: unknown, reason: unknown) {
    const quarantineKey = `${key}.invalid.${Date.now()}`
    log.error('Quarantined invalid canonical state persistence', { key, quarantineKey, reason })
    this.conf.set(quarantineKey, value)
    this.conf.delete(key)
  }

  getItem(name: string): StorageValue<PersistedCanonicalState> | null {
    const stored = this.conf.get(this.storageKey(name))
    if (stored === undefined) return this.readLegacyState()

    const parsed = StoredEnvelopeSchema.safeParse(stored)
    if (!parsed.success) {
      this.quarantine(this.storageKey(name), stored, parsed.error.issues)
      throw new CanonicalStatePersistenceError('invalid_state', 'Canonical wallet state is malformed.')
    }

    if (parsed.data.version > this.maxSupportedVersion) {
      this.writesBlocked = true
      log.error('Refused to load a newer canonical state persistence version', {
        storedVersion: parsed.data.version,
        maxSupportedVersion: this.maxSupportedVersion
      })
      throw new CanonicalStatePersistenceError(
        'unsupported_version',
        'Canonical wallet state was created by a newer Newframe version.'
      )
    }

    if (parsed.data.version === this.maxSupportedVersion) {
      const current = PersistedEnvelopeSchema.safeParse(parsed.data)
      if (!current.success) {
        this.quarantine(this.storageKey(name), stored, current.error.issues)
        throw new CanonicalStatePersistenceError('invalid_state', 'Canonical wallet state is malformed.')
      }

      return current.data
    }

    return parsed.data as StorageValue<PersistedCanonicalState>
  }

  setItem(name: string, value: StorageValue<PersistedCanonicalState>) {
    if (this.writesBlocked) return

    const parsed = PersistedEnvelopeSchema.safeParse(value)
    if (!parsed.success) {
      log.error('Refused to persist invalid canonical state', parsed.error.issues)
      return
    }
    if (parsed.data.version !== this.maxSupportedVersion) {
      log.error('Refused to persist an unsupported canonical state version', parsed.data.version)
      return
    }

    this.pending = {
      key: this.storageKey(name),
      value: structuredClone(parsed.data)
    }
  }

  finishHydration(success: boolean) {
    this.hydrating = false
    if (success) {
      this.flush()
      return
    }

    this.pending = undefined
    this.writesBlocked = true
  }

  removeItem(name: string) {
    this.pending = undefined
    this.conf.delete(this.storageKey(name))
  }

  flush() {
    if (this.hydrating || this.writesBlocked || !this.pending) return

    const pending = this.pending
    this.pending = undefined
    this.conf.set(pending.key, pending.value)
  }

  clear() {
    this.pending = undefined
    this.writesBlocked = true
    this.conf.clear()
  }
}
