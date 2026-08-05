import { describe, expect, it } from 'bun:test'

import { builtInChainIconUrl } from '../../domain/chain'
import { DEFAULT_PROFILE_ID, DEFAULT_PROFILE_NAME } from '../../domain/state/main'
import {
  CanonicalStatePersistenceError,
  createPersistenceAdapter,
  createPersistenceService,
  type PersistenceSchedulerPort,
  type PersistenceStoragePort
} from '../infrastructure/persistence'
import type { CanonicalStore } from './actions'
import createCanonicalStore from './createCanonicalStore'
import { mergePersistedState, migratePersistedState, selectPersistedState } from './persistence'
import {
  CANONICAL_STATE_STORAGE_NAME,
  PERSISTENCE_VERSION,
  type PersistedCanonicalState
} from './persist/schema'
import createInitialState from './state'
import { createTestStore } from '../../test/support/createTestStore'

class MemoryPersistence implements PersistenceStoragePort {
  readonly values: Map<string, unknown>
  failWrites = 0

  constructor(entries: Iterable<readonly [string, unknown]> = []) {
    this.values = new Map(entries)
  }

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
    if (this.failWrites > 0) {
      this.failWrites -= 1
      throw new Error('storage unavailable')
    }
    this.values.set(key, structuredClone(value))
  }
}

class ManualScheduler implements PersistenceSchedulerPort {
  readonly intervals: number[] = []
  private readonly tasks = new Set<() => void>()

  scheduleEvery(intervalMs: number, task: () => void) {
    this.intervals.push(intervalMs)
    this.tasks.add(task)
    return () => this.tasks.delete(task)
  }

  run() {
    for (const task of this.tasks) task()
  }

  get activeTasks() {
    return this.tasks.size
  }
}

const storageKey = `zustand.${CANONICAL_STATE_STORAGE_NAME}`
const canonicalState = () => createInitialState() as unknown as CanonicalStore
const account = (id: string, active?: boolean) => ({
  id,
  profileId: DEFAULT_PROFILE_ID,
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

function createTestRuntime(entries: Iterable<readonly [string, unknown]> = []) {
  const storage = new MemoryPersistence(entries)
  const scheduler = new ManualScheduler()
  const adapter = createPersistenceAdapter({
    storage,
    clock: { now: () => 1_234 }
  })
  const canonical = createCanonicalStore(adapter)
  const service = createPersistenceService({
    adapter,
    hydrate: canonical.hydrate,
    scheduler
  })

  return { adapter, scheduler, service, storage, store: canonical.store }
}

function envelope(state: PersistedCanonicalState, version = PERSISTENCE_VERSION) {
  return { state, version }
}

describe('canonical persistence lifecycle', () => {
  it('hydrates a fresh store, coalesces queued writes, flushes on schedule, and disposes cleanly', async () => {
    const { scheduler, service, storage, store } = createTestRuntime()

    expect(scheduler.activeTasks).toBe(0)
    await expect(service.start()).resolves.toBeUndefined()
    expect({
      started: service.started,
      intervals: scheduler.intervals,
      tokens: store.getState().main.tokens
    }).toEqual({
      started: true,
      intervals: [30_000],
      tokens: { accountTokenIds: {}, byId: {} }
    })

    store.getState().setAutohide(true)
    store.getState().setAutohide(false)
    expect(storage.values.has(storageKey)).toBe(false)

    scheduler.run()
    expect(storage.values.get(storageKey)).toMatchObject({
      state: { main: { autohide: false } },
      version: PERSISTENCE_VERSION
    })

    store.getState().setAutohide(true)
    service.dispose()
    service.dispose()

    expect({
      activeTasks: scheduler.activeTasks,
      persisted: storage.values.get(storageKey),
      started: service.started
    }).toMatchObject({
      activeTasks: 0,
      persisted: {
        state: { main: { autohide: true } },
        version: PERSISTENCE_VERSION
      },
      started: false
    })
  })

  it('migrates v2 state into a real fresh store and persists the current validated envelope', async () => {
    const id = '0x2222222222222222222222222222222222222222'
    const durable = canonicalState()
    durable.main.accounts[id] = account(id) as never
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
    const runtime = createTestRuntime([[storageKey, envelope(v2, 2)]])

    await runtime.service.start()

    expect({
      account: runtime.store.getState().main.accounts[id],
      autohide: runtime.store.getState().main.autohide,
      currentAccount: runtime.store.getState().main.currentAccount,
      persisted: runtime.storage.values.get(storageKey),
      tokens: runtime.store.getState().main.tokens
    }).toMatchObject({
      account: { id },
      autohide: false,
      currentAccount: id,
      persisted: {
        state: {
          main: {
            currentAccount: id,
            tokens: { accountTokenIds: {}, byId: {} }
          }
        },
        version: PERSISTENCE_VERSION
      },
      tokens: { accountTokenIds: {}, byId: {} }
    })
  })
})

describe('canonical persisted state contract', () => {
  it('never persists runtime operations and discards legacy rate caches', () => {
    const state = canonicalState()
    state.operations.secret = {
      owner: { clientType: 'wallet-ui', windowInstanceId: 'wallet-window' },
      operation: {
        id: 'secret',
        type: 'vault.unlock',
        status: 'pending',
        startedAt: 1,
        updatedAt: 1
      }
    }

    const persisted = selectPersistedState(state)
    expect(persisted).not.toHaveProperty('operations')
    expect(mergePersistedState(persisted, canonicalState()).operations).toEqual({})

    for (const version of [2, 3, 4]) {
      const legacy = selectPersistedState(canonicalState()) as any
      legacy.main.rates = { legacy: { usd: { price: 2, change24hr: 0 } } }
      legacy.main.assetRates = {
        stale: { usdRate: 3, source: 'zerion', observedAt: 1 }
      }
      legacy.main.networksMeta.ethereum[1].nativeCurrency.usd = {
        price: 0,
        change24hr: 0
      }

      const migrated = migratePersistedState(legacy, version) as any
      expect(migrated.main.assetRates).toEqual({})
      expect(migrated.main).not.toHaveProperty('rates')
      expect(migrated.main.networksMeta.ethereum[1].nativeCurrency).not.toHaveProperty('usd')
    }
  })

  it('persists variable snapshots, excludes fixed keys, and clears rates with saved data', () => {
    const durable = canonicalState()
    durable.main.assetRates['1:0x0000000000000000000000000000000000000001'] = {
      usdRate: 2,
      source: 'zerion',
      observedAt: 10
    }
    durable.main.assetRates.USDC = {
      usdRate: 0.9,
      source: 'zerion',
      observedAt: 10
    }

    const persisted = selectPersistedState(durable)
    expect(persisted.main.assetRates).toEqual({
      '1:0x0000000000000000000000000000000000000001': {
        usdRate: 2,
        source: 'zerion',
        observedAt: 10
      }
    })
    expect(mergePersistedState(persisted, canonicalState()).main.assetRates).toEqual(
      persisted.main.assetRates!
    )

    const store = createTestStore({
      main: { assetRates: structuredClone(durable.main.assetRates) }
    })
    store.getState().resetSavedData()
    expect(store.getState().main.assetRates).toEqual({})
  })

  it('projects durable state and merges it while keeping runtime-owned fields fresh', () => {
    const durable = canonicalState()
    const id = '0x1111111111111111111111111111111111111111'
    durable.main.accounts[id] = account(id, true) as never
    durable.main.appLock = { locked: false, vaultExists: false }
    durable.main.currentAccount = id
    durable.main.balances[id] = [
      {
        address: '0x0000000000000000000000000000000000000000',
        balance: '0x2a',
        chainId: 1,
        displayBalance: '42'
      }
    ]
    durable.main.assetRates[`1:${id}`] = {
      usdRate: 123,
      change24hr: 4,
      source: 'zerion',
      observedAt: 1
    }
    durable.main.signers.runtime = { id: 'runtime' } as never
    durable.main.networks.ethereum[1].connection.primary.connected = true
    ;(durable.main.networksMeta.ethereum[1] as any).blockHeight = 123

    const persisted = selectPersistedState(durable)
    const projected = persisted.main as any
    const fresh = canonicalState()
    fresh.main.appLock = { locked: true, vaultExists: true }
    const merged = mergePersistedState(persisted, fresh)

    expect({
      projected: {
        account: projected.accounts[id],
        appLock: projected.appLock,
        balances: projected.balances,
        connected: projected.networks.ethereum[1].connection.primary.connected,
        networkBlockHeight: projected.networksMeta.ethereum[1].blockHeight,
        assetRates: projected.assetRates,
        runtime: projected.runtime,
        signers: projected.signers
      },
      merged: {
        account: merged.main.accounts[id],
        appLock: merged.main.appLock,
        balances: merged.main.balances,
        currentAccount: merged.main.currentAccount,
        assetRates: merged.main.assetRates,
        runtime: merged.main.runtime
      }
    }).toEqual({
      projected: {
        account: {
          id,
          profileId: DEFAULT_PROFILE_ID,
          address: id,
          name: 'Test Account',
          lastSignerType: 'address',
          status: 'ok',
          signer: '',
          signerStatus: '',
          requests: {},
          created: 'test:1'
        },
        appLock: undefined,
        balances: durable.main.balances,
        connected: false,
        networkBlockHeight: undefined,
        assetRates: durable.main.assetRates,
        runtime: undefined,
        signers: undefined
      },
      merged: {
        account: {
          id,
          profileId: DEFAULT_PROFILE_ID,
          address: id,
          name: 'Test Account',
          lastSignerType: 'address',
          status: 'ok',
          signer: '',
          signerStatus: '',
          requests: {},
          created: 'test:1'
        },
        appLock: fresh.main.appLock,
        balances: durable.main.balances,
        currentAccount: id,
        assetRates: durable.main.assetRates,
        runtime: fresh.main.runtime
      }
    })
  })

  it('owns supported migration equivalence classes and rejects invalid inputs', () => {
    const v3 = selectPersistedState(canonicalState()) as any
    delete v3.main.balances
    delete v3.main.assetRates

    expect(migratePersistedState(v3, 3)).toEqual({
      ...v3,
      main: { ...v3.main, assetRates: {} }
    })
    expect(() => migratePersistedState(selectPersistedState(canonicalState()), 1)).toThrow(
      'uses an unsupported persistence version'
    )
    expect(() => migratePersistedState({ main: { lattice: 'not-an-object' } })).toThrow(
      CanonicalStatePersistenceError
    )
  })

  it('clears legacy scalar orders from every supported pre-v7 state', () => {
    for (const version of [2, 3, 4, 5, 6]) {
      const legacy = selectPersistedState(canonicalState()) as any
      legacy.main.autohide = true
      legacy.main.orders = {
        [`legacy-${version}`]: {
          orderId: `legacy-${version}`,
          accountAddress: '0x1111111111111111111111111111111111111111',
          chainId: 1,
          provider: 'flash',
          status: 'accepted',
          orderType: 'limit',
          side: 'sell',
          targetAsset: 'ETH',
          contraAsset: 'USDC',
          qty: '1',
          spentAsset: 'ETH',
          receiveAsset: 'USDC',
          spentAmount: '1',
          outputAmount: '2',
          estimatedOutputAmount: '2',
          createdAt: 1,
          updatedAt: 2
        }
      }

      const migrated = migratePersistedState(legacy, version)
      expect({ orders: migrated.main.orders, autohide: migrated.main.autohide }).toEqual({
        orders: {},
        autohide: true
      })
    }
  })

  it('preserves canonical asset-chain orders in v7 and migrates them idempotently', () => {
    const current = selectPersistedState(canonicalState()) as any
    const order = {
      orderId: 'canonical-order',
      accountAddress: '0x1111111111111111111111111111111111111111',
      provider: 'flash',
      source: 'flash',
      environment: 'production',
      profile: null,
      status: 'accepted',
      rawStatus: 'ORDER_STATUS_ACCEPTED',
      orderType: 'limit',
      side: 'sell',
      targetAsset: { chainId: 1, symbol: 'TARGET' },
      contraAsset: { chainId: 10, symbol: 'CONTRA' },
      qty: '1',
      spentAsset: { chainId: 42161, symbol: 'SPENT' },
      receiveAsset: { chainId: 8453, symbol: 'RECEIVE' },
      spentAmount: '1',
      outputAmount: '2',
      estimatedOutputAmount: '2',
      createdAt: 1,
      updatedAt: 2
    }
    current.main.autohide = true
    current.main.orders = { [order.orderId]: order }

    expect(PERSISTENCE_VERSION).toBe(7)
    const migrated = migratePersistedState(current, 7)
    expect(migrated.main.orders).toEqual({ [order.orderId]: order })
    expect(migrated.main.autohide).toBeTrue()
    expect(migratePersistedState(migrated)).toEqual(migrated)
  })

  it('migrates every supported profile-less state into the stable default profile', () => {
    const id = '0x1111111111111111111111111111111111111111'

    for (const version of [2, 3, 4, 5, 6]) {
      const legacy = selectPersistedState(canonicalState()) as any
      legacy.main.accounts[id] = account(id)
      delete legacy.main.accounts[id].profileId
      delete legacy.main.profiles
      delete legacy.main.profileOrder
      delete legacy.main.currentProfile
      legacy.main.accountOrder = [id]
      legacy.main.currentAccount = id

      const migrated = migratePersistedState(legacy, version)
      expect({
        profiles: migrated.main.profiles,
        profileOrder: migrated.main.profileOrder,
        currentProfile: migrated.main.currentProfile,
        currentAccount: migrated.main.currentAccount,
        account: migrated.main.accounts?.[id]
      }).toMatchObject({
        profiles: {
          [DEFAULT_PROFILE_ID]: { id: DEFAULT_PROFILE_ID, name: DEFAULT_PROFILE_NAME }
        },
        profileOrder: [DEFAULT_PROFILE_ID],
        currentProfile: DEFAULT_PROFILE_ID,
        currentAccount: id,
        account: { id, profileId: DEFAULT_PROFILE_ID }
      })
    }

    const empty = migratePersistedState({ main: {} }, 5)
    expect(empty.main).toMatchObject({
      accounts: {},
      profiles: {
        [DEFAULT_PROFILE_ID]: { id: DEFAULT_PROFILE_ID, name: DEFAULT_PROFILE_NAME }
      },
      profileOrder: [DEFAULT_PROFILE_ID],
      currentProfile: DEFAULT_PROFILE_ID,
      currentAccount: ''
    })
  })

  it('normalizes malformed v6 profile state without losing accounts and hydrates idempotently', () => {
    const malformed = {
      main: {
        accounts: {
          first: account('first'),
          second: { ...account('second'), profileId: 'missing' },
          third: { ...account('third'), profileId: 'alpha' }
        },
        accountOrder: ['missing', 'third', 'third'],
        profiles: {
          alpha: { id: 'alpha', name: 'Alpha' },
          beta: { id: 'beta', name: 'Beta' }
        },
        profileOrder: ['missing', 'alpha', 'alpha'],
        currentProfile: 'missing',
        currentAccount: 'first'
      }
    }
    malformed.main.accounts.first.profileId = 'beta'

    const migrated = migratePersistedState(malformed, 6)
    expect(migrated.main).toMatchObject({
      accountOrder: ['third', 'first', 'second'],
      profileOrder: ['alpha', 'beta'],
      currentProfile: 'beta',
      currentAccount: 'first',
      accounts: {
        first: { id: 'first', profileId: 'beta' },
        second: { id: 'second', profileId: 'beta' },
        third: { id: 'third', profileId: 'alpha' }
      }
    })
    expect(Object.keys(migrated.main.accounts || {}).sort()).toEqual(['first', 'second', 'third'])
    expect(migratePersistedState(migrated)).toEqual(migrated)
  })

  it('preserves a valid current Account when its profile conflicts with currentProfile', () => {
    const conflicting = {
      main: {
        accounts: {
          alphaAccount: { ...account('alphaAccount'), profileId: 'alpha' },
          betaAccount: { ...account('betaAccount'), profileId: 'beta' }
        },
        accountOrder: ['betaAccount', 'alphaAccount'],
        profiles: {
          alpha: { id: 'alpha', name: 'Alpha' },
          beta: { id: 'beta', name: 'Beta' }
        },
        profileOrder: ['alpha', 'beta'],
        currentProfile: 'beta',
        currentAccount: 'alphaAccount'
      }
    }

    const migrated = migratePersistedState(conflicting, 6)
    expect(migrated.main).toMatchObject({
      currentProfile: 'alpha',
      currentAccount: 'alphaAccount',
      accounts: {
        alphaAccount: { profileId: 'alpha' },
        betaAccount: { profileId: 'beta' }
      }
    })
  })

  it('deep-merges sparse network preferences while repairing retired image sources', () => {
    const current = canonicalState()
    const persisted = selectPersistedState(current)
    const metadata = (persisted.main as any).networksMeta.ethereum
    metadata[1].gas.price.levels.custom = '0x2a'
    metadata[1].icon = 'frame-cache:icon:legacy'
    metadata[10].icon = 'data:image/png;base64,aWNvbg=='
    metadata[10].image = {
      base64: 'aWNvbg==',
      contentHash: 'hash',
      mimeType: 'image/png',
      sourceUrl: builtInChainIconUrl(10)
    }

    const merged = mergePersistedState(persisted, current)

    expect({
      mainnet: {
        icon: merged.main.networksMeta.ethereum[1].icon,
        levels: merged.main.networksMeta.ethereum[1].gas.price.levels
      },
      optimism: {
        icon: merged.main.networksMeta.ethereum[10].icon,
        image: merged.main.networksMeta.ethereum[10].image
      }
    }).toEqual({
      mainnet: {
        icon: builtInChainIconUrl(1),
        levels: {
          slow: '',
          standard: '',
          fast: '',
          asap: '',
          custom: '0x2a'
        }
      },
      optimism: {
        icon: builtInChainIconUrl(10),
        image: metadata[10].image
      }
    })
  })
})

describe('canonical persistence failure boundaries', () => {
  it('quarantines corrupt state at a clock-owned key and fails real-store hydration closed', async () => {
    const corrupt = envelope({ main: { lattice: 'not-an-object' } } as unknown as PersistedCanonicalState)
    const runtime = createTestRuntime([[storageKey, corrupt]])

    await expect(runtime.service.start()).rejects.toBeInstanceOf(CanonicalStatePersistenceError)

    expect([...runtime.storage.values.entries()]).toEqual([[`${storageKey}.invalid.1234`, corrupt]])
    runtime.adapter.setItem(CANONICAL_STATE_STORAGE_NAME, {
      state: { main: { currentAccount: 'must-not-write' } },
      version: PERSISTENCE_VERSION
    })
    runtime.adapter.flush()
    expect(runtime.storage.values.has(storageKey)).toBe(false)
  })

  it('preserves newer-version state and blocks downgrade writes', async () => {
    const future = envelope({ main: {} }, PERSISTENCE_VERSION + 1)
    const runtime = createTestRuntime([[storageKey, future]])

    await expect(runtime.service.start()).rejects.toThrow('created by a newer Newframe version')
    runtime.adapter.setItem(CANONICAL_STATE_STORAGE_NAME, {
      state: { main: { currentAccount: 'downgrade' } },
      version: PERSISTENCE_VERSION
    })
    runtime.adapter.flush()

    expect(runtime.storage.values.get(storageKey)).toEqual(future)
  })

  it('retains a queued snapshot when a durable write fails so a later flush can recover', async () => {
    const runtime = createTestRuntime()
    await runtime.service.start()
    runtime.store.getState().setAutohide(false)
    runtime.storage.failWrites = 1

    expect(() => runtime.scheduler.run()).toThrow('storage unavailable')
    expect(runtime.storage.values.has(storageKey)).toBe(false)

    runtime.service.flush()
    expect(runtime.storage.values.get(storageKey)).toMatchObject({
      state: { main: { autohide: false } },
      version: PERSISTENCE_VERSION
    })
  })

  it('keeps the original corrupt value when writing its quarantine copy fails', () => {
    const corrupt = { version: 'invalid' }
    const storage = new MemoryPersistence([['zustand.state', corrupt]])
    storage.failWrites = 1
    const adapter = createPersistenceAdapter({
      storage,
      clock: { now: () => 1_234 }
    })

    expect(() => adapter.getItem('state')).toThrow('storage unavailable')
    expect([...storage.values.entries()]).toEqual([['zustand.state', corrupt]])
  })
})
