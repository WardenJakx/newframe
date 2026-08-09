import { beforeAll, beforeEach, expect, it, mock } from 'bun:test'
import { EventEmitter } from 'events'

import store from '../../state-store'
import createCanonicalStore from '../../state-store/createCanonicalStore'
import type Signer from './Signer'
import type { SignerAdapter } from './adapters'

class HotSignerMock extends EventEmitter {
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

  constructor(public id = 'signer-old') {
    super()
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

function dependencies(canonicalStore = store) {
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

const createSigners = () => new Signers(dependencies(), [], () => mock())
const createIsolatedStore = () =>
  createCanonicalStore({ getItem: () => null, setItem: () => undefined, removeItem: () => undefined }).store

it('creates fresh default hardware adapters for every signer graph', () => {
  const first = new Signers(dependencies())
  const firstAdapters = adapterInstances.slice()
  const second = new Signers(dependencies())
  const secondAdapters = adapterInstances.slice(firstAdapters.length)
  expect([firstAdapters.length, secondAdapters.length]).toEqual([3, 3])
  expect(firstAdapters.some((adapter) => secondAdapters.includes(adapter))).toBeFalse()
  first.close()
  second.close()
})

it('isolates concrete publication, capability data, and nested summary values', () => {
  const firstStore = createIsolatedStore()
  const secondStore = createIsolatedStore()
  const first = new Signers(dependencies(firstStore), [], () => mock())
  const second = new Signers(dependencies(secondStore), [], () => mock())
  const firstSigner = new HotSignerMock('graph-a-signer')
  const secondSigner = new HotSignerMock('graph-b-signer')
  first.add(firstSigner as unknown as Signer)
  second.add(secondSigner as unknown as Signer)

  const published = firstStore.getState().main.signers[firstSigner.id]
  expect(first.get(firstSigner.id)).toBe(firstSigner as unknown as Signer)
  expect(published).not.toHaveProperty('encryptedSeed')
  expect(published).not.toHaveProperty('transport')
  expect(published.addresses).not.toBe(firstSigner.addresses)
  expect(published.appVersion).not.toBe(firstSigner.appVersion)
  expect(published.capabilities).not.toBe(firstSigner.capabilities)

  firstSigner.status = 'ok'
  firstSigner.addresses.push('0x2222222222222222222222222222222222222222')
  firstSigner.appVersion.major = 99
  firstSigner.capabilities.push('Capability_Shared')
  firstSigner.emit('update')
  expect(firstStore.getState().main.signers[firstSigner.id].status).toBe('ok')
  expect(secondStore.getState().main.signers[secondSigner.id].status).toBe('locked')
  expect(published).toMatchObject({ addresses: [expect.any(String)], appVersion: { major: 0 } })
  expect(published.capabilities).toEqual(['Capability_PassphraseEntry'])
  first.close()
  second.close()
})

it('publishes hot updates, atomically rekeys, and permanently detaches removals', () => {
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

  signers.remove(handle.id)
  handle.status = 'ok'
  handle.emit('update')
  expect(store.getState().main.signers[handle.id]).toBeUndefined()
  expect(handle.close).toHaveBeenCalledTimes(1)
  expect(handle.delete).toHaveBeenCalledTimes(1)
})

it('ignores delayed adapter events and releases every lifecycle resource on close', () => {
  const adapter = new AdapterMock()
  const cancel = mock()
  const scan = Object.assign(mock(), { cancel })
  const signers = new Signers(dependencies(), [adapter as unknown as SignerAdapter], () => scan)
  const removed = new HotSignerMock('removed')
  adapter.emit('add', removed)
  signers.remove(removed.id)
  adapter.emit('update', removed)
  expect(store.getState().main.signers[removed.id]).toBeUndefined()

  const active = new HotSignerMock('active')
  adapter.emit('add', active)
  signers.close()
  signers.close()
  adapter.emit('update', active)
  active.emit('update')
  expect(adapter.close).toHaveBeenCalledTimes(1)
  expect(active.close).toHaveBeenCalledTimes(1)
  expect(store.getState().main.signers[active.id]).toBeUndefined()
  expect(cancel).toHaveBeenCalledTimes(1)
})
