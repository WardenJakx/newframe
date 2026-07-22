import { describe, expect, it, mock } from 'bun:test'

import type { StorageValue } from 'zustand/middleware'
import type { CanonicalStore } from '../../../main/store'
import createCanonicalStore from '../../../main/store/createCanonicalStore'
import {
  mergePersistedState,
  migratePersistedState,
  selectPersistedState
} from '../../../main/store/persistence'
import {
  CANONICAL_STATE_STORAGE_NAME,
  PERSISTENCE_VERSION,
  type PersistedCanonicalState
} from '../../../main/store/persist/schema'
import {
  CanonicalStatePersistenceError,
  ValidatedConfStorage
} from '../../../main/store/persist/validatedConfStorage'
import createInitialState from '../../../main/store/state'
import { builtInChainIconUrl } from '../../../resources/domain/chain'

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
const storageKey = `zustand.${CANONICAL_STATE_STORAGE_NAME}`

describe('canonical state persistence', () => {
  it('starts with fresh canonical state when persisted state does not exist', async () => {
    const values = new Map<string, unknown>()
    const conf = {
      clear: mock(() => values.clear()),
      delete: mock((key: string) => values.delete(key)),
      get: mock((key: string) => values.get(key)),
      set: mock((key: string, value: unknown) => values.set(key, value))
    }
    const storage = new ValidatedConfStorage(conf as any)
    const { hydration, store } = createCanonicalStore(storage)

    await expect(hydration).resolves.toBeUndefined()
    expect(store.getState().main.tokens).toEqual({ accountTokenIds: {}, byId: {} })
  })

  it('migrates v2 by resetting only tokens and writes the preserved state at the current version', async () => {
    const id = '0x2222222222222222222222222222222222222222'
    const durable = canonicalState()
    durable.main.accounts[id] = account(id)
    durable.main.accountOrder = [id]
    durable.main.currentAccount = id
    durable.main.autohide = false
    const v2 = selectPersistedState(durable) as any
    v2.main.tokens = {
      custom: [
        {
          address: '0x1111111111111111111111111111111111111111',
          chainId: 1,
          decimals: 6,
          name: 'Legacy Token',
          symbol: 'OLD'
        }
      ],
      known: { [id]: [] }
    }
    const values = new Map<string, unknown>([[storageKey, { state: v2, version: 2 }]])
    const conf = {
      clear: mock(() => values.clear()),
      delete: mock((key: string) => values.delete(key)),
      get: mock((key: string) => values.get(key)),
      set: mock((key: string, value: unknown) => values.set(key, value))
    }
    const storage = new ValidatedConfStorage(conf as any)
    const { hydration, store } = createCanonicalStore(storage)

    await expect(hydration).resolves.toBeUndefined()
    expect(store.getState().main.currentAccount).toBe(id)
    expect(store.getState().main.accounts[id]).toBeDefined()
    expect(store.getState().main.autohide).toBe(false)
    expect(store.getState().main.tokens).toEqual({ accountTokenIds: {}, byId: {} })
    expect(values.get(storageKey)).toEqual(
      expect.objectContaining({
        version: PERSISTENCE_VERSION,
        state: expect.objectContaining({
          main: expect.objectContaining({
            currentAccount: id,
            tokens: { accountTokenIds: {}, byId: {} }
          })
        })
      })
    )
  })

  it('retains durable state and cached balances and rates while removing runtime data', () => {
    const state = canonicalState()
    const id = '0x1111111111111111111111111111111111111111'
    state.main.accounts[id] = account(id, true)
    state.main.appLock = { locked: true, vaultExists: true }
    state.main.currentAccount = id
    state.main.balances[id] = [
      {
        address: '0x0000000000000000000000000000000000000000',
        balance: '0x1',
        chainId: 1,
        displayBalance: '1'
      }
    ]
    state.main.rates[id] = { usd: { price: 123, change24hr: 4 } }
    state.main.signers.runtime = { id: 'runtime' }
    state.main.tokens.byId['1:0x1111111111111111111111111111111111111111'] = {
      address: '0x1111111111111111111111111111111111111111',
      chainId: 1,
      custom: true,
      curated: false,
      decimals: 6,
      image: {
        base64: 'aWNvbg==',
        contentHash: 'token-image',
        mimeType: 'image/png'
      },
      name: 'Persisted Token',
      sources: ['custom'],
      symbol: 'PTKN',
      updatedAt: 1
    }
    state.main.networks.ethereum[1].connection.primary.connected = true
    ;(state.main.networksMeta.ethereum[1] as any).blockHeight = 123
    state.main.networksMeta.ethereum[1].nativeCurrency.usd = { price: 3_000, change24hr: 2 }

    const persisted = selectPersistedState(state)
    const main = persisted.main as any

    expect(main.currentAccount).toBe(id)
    expect(main.appLock).toBeUndefined()
    expect(main.balances).toEqual(state.main.balances)
    expect(main.rates).toEqual(state.main.rates)
    expect(main.runtime).toBeUndefined()
    expect(main.signers).toBeUndefined()
    expect(main.accounts[id]).toMatchObject({ requests: {}, signer: '', status: 'ok' })
    expect(main.accounts[id].active).toBeUndefined()
    expect(main.accounts[id].balances).toBeUndefined()
    expect(main.networks.ethereum[1].connection.primary.connected).toBe(false)
    expect(main.networksMeta.ethereum[1].blockHeight).toBeUndefined()
    expect(main.networksMeta.ethereum[1].nativeCurrency.usd).toEqual({ price: 3_000, change24hr: 2 })
    expect(main.tokens.byId['1:0x1111111111111111111111111111111111111111'].image).toEqual({
      base64: 'aWNvbg==',
      contentHash: 'token-image',
      mimeType: 'image/png'
    })
  })

  it('merges durable state and cached balances and rates while keeping runtime slices fresh', () => {
    const current = canonicalState()
    current.main.appLock = { locked: true, vaultExists: true }
    const id = '0x2222222222222222222222222222222222222222'
    const durable = canonicalState()
    durable.main.accounts[id] = account(id)
    durable.main.accountOrder = [id]
    durable.main.currentAccount = id
    durable.main.balances[id] = [
      {
        address: '0x0000000000000000000000000000000000000000',
        balance: '0x2a',
        chainId: 1,
        displayBalance: '42'
      }
    ]
    durable.main.rates[id] = { usd: { price: 123, change24hr: 4 } }
    const persisted = selectPersistedState(durable)

    const merged = mergePersistedState(persisted, current)

    expect(merged.main.currentAccount).toBe(id)
    expect(merged.main.appLock).toBe(current.main.appLock)
    expect(merged.main.accounts[id].active).toBeUndefined()
    expect(merged.main.accounts[id].requests).toEqual({})
    expect(merged.main.balances).toEqual(durable.main.balances)
    expect(merged.main.rates).toEqual(durable.main.rates)
    expect(merged.main.runtime).toBe(current.main.runtime)
  })

  it('migrates v3 snapshots that do not contain cached balances or rates', () => {
    const v3 = selectPersistedState(canonicalState()) as any
    delete v3.main.balances
    delete v3.main.rates

    expect(migratePersistedState(v3, 3)).toEqual(v3)
  })

  it('coalesces writes and flushes only the latest validated snapshot', () => {
    const values = new Map<string, unknown>()
    const conf = {
      clear: mock(() => values.clear()),
      delete: mock((key: string) => values.delete(key)),
      get: mock((key: string) => values.get(key)),
      set: mock((key: string, value: unknown) => values.set(key, value))
    }
    const storage = new ValidatedConfStorage(conf as any)
    const first: StorageValue<PersistedCanonicalState> = {
      state: { main: { currentAccount: 'first' } },
      version: PERSISTENCE_VERSION
    }
    const latest: StorageValue<PersistedCanonicalState> = {
      state: { main: { currentAccount: 'latest' } },
      version: PERSISTENCE_VERSION
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
        version: PERSISTENCE_VERSION
      })
    )
  })

  it('rejects malformed and unsupported persistence versions', () => {
    expect(() => migratePersistedState(selectPersistedState(canonicalState()), 1)).toThrow(
      'uses an unsupported persistence version'
    )
    expect(() => migratePersistedState({ main: { lattice: 'not-an-object' } })).toThrow(
      CanonicalStatePersistenceError
    )
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

  it('replaces retired icon strings and preserves matching structured images', () => {
    const current = canonicalState()
    const persisted = selectPersistedState(current)
    const metadata = (persisted.main as any).networksMeta.ethereum
    metadata[1].icon = 'frame-cache:icon:legacy'
    metadata[10].icon = 'data:image/png;base64,aWNvbg=='
    metadata[10].image = {
      base64: 'aWNvbg==',
      contentHash: 'hash',
      mimeType: 'image/png',
      sourceUrl: builtInChainIconUrl(10)
    }

    const merged = mergePersistedState(persisted, current)

    expect(merged.main.networksMeta.ethereum[1].icon).toBe(builtInChainIconUrl(1))
    expect(merged.main.networksMeta.ethereum[10].icon).toBe(builtInChainIconUrl(10))
    expect(merged.main.networksMeta.ethereum[10].image).toEqual(metadata[10].image)
  })

  it('quarantines malformed current persistence and fails closed', () => {
    const values = new Map<string, unknown>([
      ['zustand.state', { state: { main: { lattice: 'not-an-object' } }, version: PERSISTENCE_VERSION }]
    ])
    const conf = {
      clear: mock(() => values.clear()),
      delete: mock((key: string) => values.delete(key)),
      get: mock((key: string) => values.get(key)),
      set: mock((key: string, value: unknown) => values.set(key, value))
    }

    expect(() => new ValidatedConfStorage(conf as any).getItem('state')).toThrow(
      CanonicalStatePersistenceError
    )
    expect(values.has('zustand.state')).toBe(false)
    expect([...values.keys()].some((key) => key.startsWith('zustand.state.invalid.'))).toBe(true)
  })

  it('rejects canonical store hydration when storage is invalid', async () => {
    const values = new Map<string, unknown>([
      [storageKey, { state: { main: { lattice: 'not-an-object' } }, version: PERSISTENCE_VERSION }]
    ])
    const conf = {
      clear: mock(() => values.clear()),
      delete: mock((key: string) => values.delete(key)),
      get: mock((key: string) => values.get(key)),
      set: mock((key: string, value: unknown) => values.set(key, value))
    }

    const storage = new ValidatedConfStorage(conf as any)
    const { hydration } = createCanonicalStore(storage)

    await expect(hydration).rejects.toBeInstanceOf(CanonicalStatePersistenceError)
    storage.flush()

    expect(values.has(storageKey)).toBe(false)
    expect([...values.keys()].some((key) => key.startsWith(`${storageKey}.invalid.`))).toBe(true)
  })

  it('fails closed without overwriting persistence created by a newer application version', () => {
    const future = { state: { main: {} }, version: PERSISTENCE_VERSION + 1 }
    const values = new Map<string, unknown>([['zustand.state', future]])
    const conf = {
      clear: mock(() => values.clear()),
      delete: mock((key: string) => values.delete(key)),
      get: mock((key: string) => values.get(key)),
      set: mock((key: string, value: unknown) => values.set(key, value))
    }
    const storage = new ValidatedConfStorage(conf as any, PERSISTENCE_VERSION)

    expect(() => storage.getItem('state')).toThrow(CanonicalStatePersistenceError)
    expect(() => storage.getItem('state')).toThrow('created by a newer Newframe version')
    storage.setItem('state', {
      state: { main: { currentAccount: 'downgrade' } },
      version: PERSISTENCE_VERSION
    })
    storage.flush()

    expect(values.get('zustand.state')).toBe(future)
    expect(conf.set).not.toHaveBeenCalled()
  })
})
