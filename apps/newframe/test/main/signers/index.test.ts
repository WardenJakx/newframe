import { beforeAll, beforeEach, expect, it, mock } from 'bun:test'

import { EventEmitter } from 'events'

import store from '../../../main/store'
import type Signer from '../../../main/signers/Signer'
import type { SignerAdapter } from '../../../main/signers/adapters'

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

class AdapterMock extends EventEmitter {
  adapterType = 'mock'
  open = mock()
  close = mock()
  remove = mock()
  reload = mock()
}

mock.module('../../../main/signers/hot/HotSigner', () => ({ default: HotSignerMock }))
mock.module('../../../main/signers/hot', () => ({
  default: { scan: () => mock() },
  newPhrase: mock(),
  createFromPhrase: mock(),
  createFromPrivateKey: mock(),
  createFromKeystore: mock(),
  scan: mock()
}))
mock.module('../../../main/signers/ledger/adapter', () => ({ default: AdapterMock }))
mock.module('../../../main/signers/trezor/adapter', () => ({ default: AdapterMock }))
mock.module('../../../main/signers/lattice/adapter', () => ({ default: AdapterMock }))

let Signers: typeof import('../../../main/signers').Signers

beforeAll(async () => {
  Signers = (await import('../../../main/signers')).Signers
})

beforeEach(() => {
  store.setState((state) => {
    state.main.signers = {}
  })
})

function createSigners() {
  return new Signers([], () => mock())
}

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
  const signers = new Signers([adapter as unknown as SignerAdapter], () => mock())
  const handle = new HotSignerMock()
  adapter.emit('add', handle)

  signers.remove(handle.id)
  adapter.emit('update', handle)

  expect(signers.get(handle.id)).toBeUndefined()
  expect(store.getState().main.signers[handle.id]).toBeUndefined()
})

it('detaches adapter and handle listeners when closing', () => {
  const adapter = new AdapterMock()
  const signers = new Signers([adapter as unknown as SignerAdapter], () => mock())
  const handle = new HotSignerMock()
  adapter.emit('add', handle)

  signers.close()
  adapter.emit('update', handle)
  handle.emit('update')

  expect(adapter.close).toHaveBeenCalledTimes(1)
  expect(handle.close).toHaveBeenCalledTimes(1)
  expect(store.getState().main.signers[handle.id]).toBeUndefined()
})
