import { beforeAll, beforeEach, expect, it, mock } from 'bun:test'

import { EventEmitter } from 'events'

import store from '../store'
import createCanonicalStore from '../store/createCanonicalStore'
import type Signer from './Signer'
import type { SignerAdapter } from './adapters'

class HotSignerMock extends EventEmitter {
  id: string
  type = 'seed'
  name = 'Test signer'
  model = ''
  status = 'locked'
  addresses = ['0x1111111111111111111111111111111111111111']
  appVersion = { major: 0, minor: 0, patch: 0 }
  capabilities = ['Capability_PassphraseEntry']
  encryptedSeed = 'must-not-enter-state'
  transport = { secret: 'must-not-enter-state' }

  close = mock()
  delete = mock()
  unlock = mock((_key: string, cb: Callback<boolean>) => cb(null, true))

  constructor(id = 'signer-old') {
    super()
    this.id = id
  }

  summary() {
    const { id, name, model, type, addresses, status, appVersion, capabilities } = this
    return { id, name, model, type, addresses, status, appVersion, capabilities }
  }
}

const adapterInstances: AdapterMock[] = []

class AdapterMock extends EventEmitter {
  adapterType = 'mock'
  open = mock()
  close = mock()
  remove = mock()
  reload = mock()

  constructor() {
    super()
    adapterInstances.push(this)
  }
}

mock.module('./hot/HotSigner', () => ({ default: HotSignerMock }))
mock.module('./hot', () => ({
  default: { scan: () => mock() },
  newPhrase: mock(),
  createFromPhrase: mock(),
  createFromPrivateKey: mock(),
  createFromKeystore: mock(),
  scan: mock()
}))
mock.module('./ledger/adapter', () => ({ default: AdapterMock }))
mock.module('./trezor/adapter', () => ({ default: AdapterMock }))
mock.module('./lattice/adapter', () => ({ default: AdapterMock }))

let Signers: typeof import('./index').Signers

beforeAll(async () => {
  Signers = (await import('./index')).Signers
})

beforeEach(() => {
  adapterInstances.length = 0
  store.setState((state) => {
    state.main.signers = {}
  })
})

function createSigners() {
  return new Signers(createDependencies(), [], () => mock())
}

function createDependencies(canonicalStore = store) {
  return {
    biometrics: { unlock: mock(async () => '') },
    store: canonicalStore,
    vault: {
      acquireKey: mock(() => ''),
      exists: mock(() => false),
      getKey: mock(() => null),
      isUnlocked: mock(() => false),
      lock: mock(),
      summary: mock(() => ({ exists: false, unlocked: false })),
      unlock: mock(() => ''),
      unlockWithKey: mock(() => '')
    }
  }
}

it('creates fresh default hardware adapters for every signer graph', () => {
  const first = new Signers(createDependencies())
  const firstAdapters = adapterInstances.slice()
  const second = new Signers(createDependencies())
  const secondAdapters = adapterInstances.slice(firstAdapters.length)

  expect({
    firstCount: firstAdapters.length,
    secondCount: secondAdapters.length,
    shared: firstAdapters.some((adapter) => secondAdapters.includes(adapter))
  }).toEqual({
    firstCount: 3,
    secondCount: 3,
    shared: false
  })

  first.close()
  second.close()
})

it('keeps concrete signer publication isolated across two canonical graphs', () => {
  const memoryStorage = {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined
  }
  const firstStore = createCanonicalStore(memoryStorage).store
  const secondStore = createCanonicalStore(memoryStorage).store
  const first = new Signers(createDependencies(firstStore), [], () => mock())
  const second = new Signers(createDependencies(secondStore), [], () => mock())
  const firstSigner = new HotSignerMock('graph-a-signer')
  const secondSigner = new HotSignerMock('graph-b-signer')

  first.add(firstSigner as unknown as Signer)
  second.add(secondSigner as unknown as Signer)
  firstSigner.status = 'ok'
  firstSigner.emit('update')

  expect({
    first: firstStore.getState().main.signers,
    second: secondStore.getState().main.signers
  }).toEqual({
    first: {
      'graph-a-signer': expect.objectContaining({ id: 'graph-a-signer', status: 'ok' })
    },
    second: {
      'graph-b-signer': expect.objectContaining({ id: 'graph-b-signer', status: 'locked' })
    }
  })

  first.close()
  second.close()
})

it('keeps capability handles private and publishes only their summaries', () => {
  const signers = createSigners()
  const handle = new HotSignerMock()

  signers.add(handle as unknown as Signer)

  expect(signers.get(handle.id)).toBe(handle as unknown as Signer)
  expect(store.getState().main.signers[handle.id]).toMatchObject(handle.summary())
  expect(store.getState().main.signers[handle.id]).not.toHaveProperty('encryptedSeed')
  expect(store.getState().main.signers[handle.id]).not.toHaveProperty('transport')
})

it('isolates nested canonical summary values from capability-owned references', () => {
  const signers = createSigners()
  const handle = new HotSignerMock()
  signers.add(handle as unknown as Signer)
  const summary = store.getState().main.signers[handle.id]

  expect(summary.addresses).not.toBe(handle.addresses)
  expect(summary.appVersion).not.toBe(handle.appVersion)
  expect(summary.capabilities).not.toBe(handle.capabilities)

  handle.addresses.push('0x2222222222222222222222222222222222222222')
  handle.appVersion.major = 99
  handle.capabilities.push('Capability_Shared')

  expect(summary.addresses).toHaveLength(1)
  expect(summary.appVersion.major).toBe(0)
  expect(summary.capabilities).toEqual(['Capability_PassphraseEntry'])
})

it('publishes hot signer changes through the canonical manager', () => {
  const signers = createSigners()
  const handle = new HotSignerMock()
  signers.add(handle as unknown as Signer)

  handle.status = 'ok'
  handle.emit('update')

  expect(store.getState().main.signers[handle.id].status).toBe('ok')
})

it('atomically re-keys a changing hot signer id', () => {
  const signers = createSigners()
  const handle = new HotSignerMock()
  signers.add(handle as unknown as Signer)
  const createdAt = store.getState().main.signers[handle.id].createdAt
  const observed: Array<Record<string, unknown>> = []
  const unsubscribe = store.subscribe(
    (state) => state.main.signers,
    (summaries) => observed.push(summaries)
  )

  handle.id = 'signer-new'
  handle.addresses = ['0x2222222222222222222222222222222222222222']
  handle.emit('update')
  unsubscribe()

  expect(observed).toHaveLength(1)
  expect(observed[0]).not.toHaveProperty('signer-old')
  expect(observed[0]['signer-new']).toMatchObject({
    id: 'signer-new',
    addresses: handle.addresses,
    createdAt
  })
  expect(signers.get('signer-old')).toBeUndefined()
  expect(signers.get('signer-new')).toBe(handle as unknown as Signer)
})

it('detaches hot signer listeners before removing a signer', () => {
  const signers = createSigners()
  const handle = new HotSignerMock()
  signers.add(handle as unknown as Signer)

  signers.remove(handle.id)
  handle.status = 'ok'
  handle.emit('update')

  expect(store.getState().main.signers[handle.id]).toBeUndefined()
  expect(handle.close).toHaveBeenCalledTimes(1)
  expect(handle.delete).toHaveBeenCalledTimes(1)
})

it('does not resurrect a detached signer from a delayed adapter update', () => {
  const adapter = new AdapterMock()
  const signers = new Signers(createDependencies(), [adapter as unknown as SignerAdapter], () => mock())
  const handle = new HotSignerMock()
  adapter.emit('add', handle)

  signers.remove(handle.id)
  adapter.emit('update', handle)

  expect(signers.get(handle.id)).toBeUndefined()
  expect(store.getState().main.signers[handle.id]).toBeUndefined()
})

it('detaches adapter and handle listeners when closing', () => {
  const adapter = new AdapterMock()
  const signers = new Signers(createDependencies(), [adapter as unknown as SignerAdapter], () => mock())
  const handle = new HotSignerMock()
  adapter.emit('add', handle)

  signers.close()
  adapter.emit('update', handle)
  handle.emit('update')

  expect(adapter.close).toHaveBeenCalledTimes(1)
  expect(handle.close).toHaveBeenCalledTimes(1)
  expect(store.getState().main.signers[handle.id]).toBeUndefined()
})

it('cancels the scheduled hot signer scan once when closing', () => {
  const cancel = mock()
  const scan = Object.assign(mock(), { cancel })
  const signers = new Signers(createDependencies(), [], () => scan)

  signers.close()
  signers.close()

  expect(cancel).toHaveBeenCalledTimes(1)
})
