import { describe, expect, it, jest } from 'bun:test'

import type { StorageValue } from 'zustand/middleware'
import type { CanonicalStore } from '../../../main/store'
import createCanonicalStore from '../../../main/store/createCanonicalStore'
import {
  mergePersistedState,
  migratePersistedState,
  selectPersistedState
} from '../../../main/store/persistence'
import type { PersistedCanonicalState } from '../../../main/store/persist/schema'
import {
  CanonicalStatePersistenceError,
  ValidatedConfStorage
} from '../../../main/store/persist/validatedConfStorage'
import createInitialState from '../../../main/store/state'

const account = (id: string, active?: boolean) => ({
  id,
  address: id,
  name: 'Test Account',
  lastSignerType: 'address',
  status: 'ok',
  signer: '',
  requests: { pending: { id: 'pending' } },
  created: 'test:1',
  active,
  balances: { lastUpdated: 123 }
})

const canonicalState = () => createInitialState() as unknown as CanonicalStore

describe('canonical state persistence', () => {
  it('retains durable state while removing runtime and externally derived data', () => {
    const state = canonicalState()
    const id = '0x1111111111111111111111111111111111111111'
    state.main.accounts[id] = account(id, true)
    state.main.appLock = { locked: true, vaultExists: true }
    state.main.currentAccount = id
    state.main.balances[id] = [{ balance: '1' } as any]
    state.main.rates[id] = { usd: { price: 123, change24hr: 4 } }
    state.main.signers.runtime = { id: 'runtime' }
    state.main.networks.ethereum[1].connection.primary.connected = true
    ;(state.main.networksMeta.ethereum[1] as any).blockHeight = 123
    state.main.networksMeta.ethereum[1].nativeCurrency.usd = { price: 3_000, change24hr: 2 }

    const persisted = selectPersistedState(state)
    const main = persisted.main as any

    expect(main.currentAccount).toBe(id)
    expect(main.appLock).toBeUndefined()
    expect(main.balances).toBeUndefined()
    expect(main.rates).toBeUndefined()
    expect(main.runtime).toBeUndefined()
    expect(main.signers).toBeUndefined()
    expect(main.accounts[id]).toMatchObject({ requests: {}, signer: '', status: 'ok' })
    expect(main.accounts[id].active).toBeUndefined()
    expect(main.accounts[id].balances).toBeUndefined()
    expect(main.networks.ethereum[1].connection.primary.connected).toBe(false)
    expect(main.networksMeta.ethereum[1].blockHeight).toBeUndefined()
    expect(main.networksMeta.ethereum[1].nativeCurrency.usd).toEqual({ price: 0, change24hr: 0 })
  })

  it('migrates legacy active selection once and keeps runtime slices fresh', () => {
    const current = canonicalState()
    current.main.appLock = { locked: true, vaultExists: true }
    const id = '0x2222222222222222222222222222222222222222'
    const persisted = {
      main: {
        accounts: { [id]: account(id, true) },
        accountOrder: [id],
        appLock: { locked: false, vaultExists: false },
        balances: { [id]: [] },
        currentAccount: '',
        rates: { stale: { usd: { price: 99, change24hr: 0 } } },
        runtime: { profile: 'persisted-runtime' }
      }
    }

    const merged = mergePersistedState(persisted, current)

    expect(merged.main.currentAccount).toBe(id)
    expect(merged.main.appLock).toBe(current.main.appLock)
    expect('current' in merged.selected).toBe(false)
    expect(merged.main.accounts[id].active).toBeUndefined()
    expect(merged.main.accounts[id].requests).toEqual({})
    expect(merged.main.balances).toBe(current.main.balances)
    expect(merged.main.rates).toBe(current.main.rates)
    expect(merged.main.runtime).toBe(current.main.runtime)
  })

  it('coalesces writes and flushes only the latest validated snapshot', () => {
    const values = new Map<string, unknown>()
    const conf = {
      clear: jest.fn(() => values.clear()),
      delete: jest.fn((key: string) => values.delete(key)),
      get: jest.fn((key: string) => values.get(key)),
      set: jest.fn((key: string, value: unknown) => values.set(key, value))
    }
    const storage = new ValidatedConfStorage(conf as any)
    const first: StorageValue<PersistedCanonicalState> = {
      state: { main: { currentAccount: 'first' } },
      version: 2
    }
    const latest: StorageValue<PersistedCanonicalState> = {
      state: { main: { currentAccount: 'latest' } },
      version: 2
    }

    storage.setItem('state', first)
    storage.setItem('state', latest)
    expect(conf.set).not.toHaveBeenCalled()

    storage.flush()
    expect(conf.set).not.toHaveBeenCalled()

    storage.finishHydration(true)
    expect(conf.set).toHaveBeenCalledTimes(1)
    storage.flush()

    expect(conf.set).toHaveBeenCalledTimes(1)
    expect(conf.set).toHaveBeenCalledWith(
      'zustand.state',
      expect.objectContaining({
        state: expect.objectContaining({
          main: expect.objectContaining({ currentAccount: 'latest' })
        }),
        version: 2
      })
    )
  })

  it('migrates obsolete Restore fields and mute keys through native persistence versioning', () => {
    const migrated = migratePersistedState(
      {
        main: {
          _version: 2,
          colorway: 'dark',
          hardwareDerivation: 'mainnet',
          dapp: { storage: { secret: true } },
          mute: {
            alphaWarning: true,
            betaDisclosure: true,
            explorerWarning: true,
            externalLinkWarning: true,
            gasFeeWarning: false,
            onboardingWindow: false,
            signerCompatibilityWarning: true,
            welcomeWarning: true
          }
        }
      },
      1
    )

    expect(migrated.main).not.toHaveProperty('_version')
    expect(migrated.main).not.toHaveProperty('colorway')
    expect(migrated.main).not.toHaveProperty('hardwareDerivation')
    expect(migrated.main).not.toHaveProperty('dapp')
    expect(migrated.main.mute).toEqual({
      explorerWarning: true,
      gasFeeWarning: false,
      onboardingWindow: false,
      signerCompatibilityWarning: true
    })
  })

  it('supplies a valid color for legacy custom-chain metadata that did not have one', () => {
    const legacy = selectPersistedState(canonicalState()) as any
    delete legacy.main.networksMeta.ethereum[1].primaryColor

    const migrated = migratePersistedState(legacy, 0)

    expect((migrated.main as any).networksMeta.ethereum[1].primaryColor).toBe('accent1')
  })

  it('fails closed when legacy persistence cannot be migrated', () => {
    expect(() => migratePersistedState({ main: { lattice: 'not-an-object' } }, 1)).toThrow(
      CanonicalStatePersistenceError
    )
    expect(() => migratePersistedState({ main: {} }, 99)).toThrow('uses an unsupported persistence version')
  })

  it('deep-merges sparse persisted gas preferences into default network metadata', () => {
    const current = canonicalState()
    const persisted = selectPersistedState(current)
    const price = (persisted.main as any).networksMeta.ethereum[1].gas.price
    price.levels.custom = '0x2a'

    const merged = mergePersistedState(persisted, current)

    expect(merged.main.networksMeta.ethereum[1].gas.price.levels).toEqual({
      slow: '',
      standard: '',
      fast: '',
      asap: '',
      custom: '0x2a'
    })
  })

  it('quarantines malformed current persistence and fails closed', () => {
    const values = new Map<string, unknown>([
      ['zustand.state', { state: { main: { lattice: 'not-an-object' } }, version: 2 }]
    ])
    const conf = {
      clear: jest.fn(() => values.clear()),
      delete: jest.fn((key: string) => values.delete(key)),
      get: jest.fn((key: string) => values.get(key)),
      set: jest.fn((key: string, value: unknown) => values.set(key, value))
    }

    expect(() => new ValidatedConfStorage(conf as any).getItem('state')).toThrow(
      CanonicalStatePersistenceError
    )
    expect(values.has('zustand.state')).toBe(false)
    expect([...values.keys()].some((key) => key.startsWith('zustand.state.invalid.'))).toBe(true)
  })

  it('rejects canonical store hydration when storage is invalid', async () => {
    const values = new Map<string, unknown>([
      ['zustand.canonical-wallet-state', { state: { main: { lattice: 'not-an-object' } }, version: 2 }]
    ])
    const conf = {
      clear: jest.fn(() => values.clear()),
      delete: jest.fn((key: string) => values.delete(key)),
      get: jest.fn((key: string) => values.get(key)),
      set: jest.fn((key: string, value: unknown) => values.set(key, value))
    }

    const storage = new ValidatedConfStorage(conf as any)
    const { hydration } = createCanonicalStore(storage)

    await expect(hydration).rejects.toBeInstanceOf(CanonicalStatePersistenceError)
    storage.flush()

    expect(values.has('zustand.canonical-wallet-state')).toBe(false)
    expect([...values.keys()].some((key) => key.startsWith('zustand.canonical-wallet-state.invalid.'))).toBe(
      true
    )
  })

  it('fails closed without overwriting persistence created by a newer application version', () => {
    const future = { state: { main: {} }, version: 3 }
    const values = new Map<string, unknown>([['zustand.state', future]])
    const conf = {
      clear: jest.fn(() => values.clear()),
      delete: jest.fn((key: string) => values.delete(key)),
      get: jest.fn((key: string) => values.get(key)),
      set: jest.fn((key: string, value: unknown) => values.set(key, value))
    }
    const storage = new ValidatedConfStorage(conf as any, 2)

    expect(() => storage.getItem('state')).toThrow(CanonicalStatePersistenceError)
    expect(() => storage.getItem('state')).toThrow('created by a newer Newframe version')
    storage.setItem('state', { state: { main: { currentAccount: 'downgrade' } }, version: 2 })
    storage.flush()

    expect(values.get('zustand.state')).toBe(future)
    expect(conf.set).not.toHaveBeenCalled()
  })
})
