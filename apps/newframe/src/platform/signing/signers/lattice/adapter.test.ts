import { afterAll, afterEach, beforeAll, beforeEach, expect, it, mock, spyOn } from 'bun:test'
import { EventEmitter } from 'events'
import log from 'electron-log'

import LatticeSignerAdapter from './adapter'
import store from '../../../state-store'
import createCanonicalStore from '../../../state-store/createCanonicalStore'

const calls = <T extends unknown[]>(fn: unknown) => (fn as { mock: { calls: T[] } }).mock.calls

function fakeSigner(deviceId = 'NBaJ8e') {
  return Object.assign(new EventEmitter(), {
    id: `lattice-${deviceId}`,
    deviceId,
    deviceName: 'Newframe-testlattice',
    accountLimit: 5,
    derivation: 'legacy',
    addresses: Array(5).fill('addr'),
    connection: undefined as { baseUrl: string; isPaired?: boolean } | undefined,
    connect: mock(async (_baseUrl?: string, _privateKey?: string) => true),
    disconnect: mock(),
    deriveAddresses: mock(),
    close: mock()
  })
}

type FakeSigner = ReturnType<typeof fakeSigner>

const device = (signer: FakeSigner, paired: boolean) => ({
  deviceName: signer.deviceName,
  tag: 'ABCXYZ',
  privKey: 'supersecretkey',
  paired
})

const setDevices = (devices: Record<string, ReturnType<typeof device>>) =>
  store.setState((state) => {
    state.main.lattice = devices
  })

const setSettings = (update: Partial<ReturnType<typeof store.getState>['main']['latticeSettings']>) =>
  store.setState((state) => {
    Object.assign(state.main.latticeSettings, update)
  })

let signer: FakeSigner
let adapter: LatticeSignerAdapter

beforeAll(() => (log.transports.console.level = false))
afterAll(() => (log.transports.console.level = 'debug'))

beforeEach(() => {
  setDevices({})
  setSettings({ accountLimit: 5, derivation: 'legacy', endpointMode: 'default', endpointCustom: '' })
  signer = fakeSigner()
  adapter = new LatticeSignerAdapter(store, () => signer as never)
})

afterEach(() => {
  adapter.close()
  mock.restore()
})

it('owns subscriptions, removal, reload, and close as one adapter lifecycle', async () => {
  const additions: FakeSigner[] = []
  adapter.on('add', (added) => additions.push(added as unknown as FakeSigner))
  adapter.open()
  expect(adapter.adapterType).toBe('lattice')

  const removeLattice = spyOn(store.getState(), 'removeLattice')
  const unknown = fakeSigner('unknown')
  adapter.remove(unknown as never)
  setDevices({ NBaJ8e: device(signer, true) })
  adapter.remove(signer as never)
  expect(calls<[string]>(removeLattice).map(([id]) => id)).toEqual(['unknown', 'NBaJ8e'])
  expect(unknown.close).not.toHaveBeenCalled()
  expect(signer.close).toHaveBeenCalledTimes(1)

  setDevices({ NBaJ8e: device(signer, true) })
  await adapter.reload(signer as never)
  expect(signer.disconnect).toHaveBeenCalledTimes(1)
  expect(signer.connect).toHaveBeenCalledWith('https://signing.gridpl.us', 'supersecretkey')

  adapter.close()
  setDevices({ NBaJ8e: device(signer, true) })
  expect(additions).toEqual([signer])
})

it('ignores a stale connection failure after close and reopen', async () => {
  const memoryStorage = { getItem: () => null, setItem: () => undefined, removeItem: () => undefined }
  const freshStore = createCanonicalStore(memoryStorage).store
  const first = fakeSigner('fresh-device')
  const reopened = fakeSigner('fresh-device')
  let rejectFirst: (error: Error) => void = () => {}
  first.connect = mock(() => new Promise<boolean>((_resolve, reject) => (rejectFirst = reject)))
  const pending = [first, reopened]
  const freshAdapter = new LatticeSignerAdapter(freshStore, () => pending.shift() as never)
  freshStore.setState((state) => {
    state.main.lattice = {
      'fresh-device': {
        deviceName: 'Fresh lattice',
        tag: 'FRESH1',
        privKey: 'fresh-private-key',
        paired: true
      }
    }
  })

  freshAdapter.open()
  freshAdapter.close()
  freshAdapter.open()
  rejectFirst(new Error('late relay failure'))
  await Promise.resolve()
  await Promise.resolve()
  expect(first.connect).toHaveBeenCalledTimes(1)
  expect(reopened.connect).toHaveBeenCalledTimes(1)
  expect(freshStore.getState().main.lattice['fresh-device'].paired).toBeTrue()
  freshAdapter.close()
})

it('applies endpoint, derivation, and account-limit settings without redundant work', async () => {
  setDevices({ NBaJ8e: device(signer, false) })
  signer.connection = { baseUrl: 'https://signing.gridpl.us' }
  adapter.open()
  expect(signer.connect.mock.calls).toEqual([])
  signer.connect.mockClear()
  signer.disconnect.mockClear()

  delete signer.connection
  setSettings({ endpointMode: 'custom', endpointCustom: 'https://myendpoint.io' })
  signer.connection = { baseUrl: 'https://signing.gridpl.us' }
  setSettings({ endpointMode: 'custom', endpointCustom: 'https://signing.gridpl.us' })
  expect(signer.connect).not.toHaveBeenCalled()

  setSettings({ endpointMode: 'custom', endpointCustom: 'https://myendpoint.io' })
  await Promise.resolve()
  signer.connection = { baseUrl: 'https://customendpoint.io' }
  setSettings({ endpointMode: 'standard' })
  await Promise.resolve()
  expect(signer.connect.mock.calls).toEqual([
    ['https://myendpoint.io', 'supersecretkey'],
    ['https://signing.gridpl.us', 'supersecretkey']
  ])
  expect(signer.disconnect).toHaveBeenCalledTimes(2)

  signer.connection = { baseUrl: 'https://signing.gridpl.us' }
  setSettings({ derivation: 'standard' })
  setSettings({ accountLimit: 10 })
  expect(signer).toMatchObject({ derivation: 'standard', accountLimit: 10 })
  expect(signer.deriveAddresses).toHaveBeenCalledTimes(2)
  signer.addresses = Array(10).fill('addr')
  const updates = mock()
  adapter.on('update', updates)
  setSettings({ accountLimit: 4 })
  expect(signer.deriveAddresses).toHaveBeenCalledTimes(2)
  expect(updates).toHaveBeenCalledWith(signer)
})

it('projects paired-device creation and signer event transitions', () => {
  const updateLattice = spyOn(store.getState(), 'updateLattice')
  const additions = mock()
  const updates = mock()
  const removals = mock()
  adapter.on('add', additions)
  adapter.on('update', updates)
  adapter.on('remove', removals)
  adapter.open()

  setDevices({ NBaJ8e: device(signer, true) })
  expect(additions).toHaveBeenCalledWith(signer)
  expect(signer.connect).toHaveBeenCalledWith('https://signing.gridpl.us', 'supersecretkey')

  signer.emit('connect', true)
  signer.emit('paired', true)
  expect(calls<[string, { paired: boolean }]>(updateLattice).slice(-2)).toEqual([
    ['NBaJ8e', { paired: true }],
    ['NBaJ8e', { paired: true }]
  ])
  expect(signer.deriveAddresses).toHaveBeenCalledTimes(2)

  signer.emit('update')
  signer.emit('close')
  expect(updates).toHaveBeenCalledWith(signer)
  expect(removals).toHaveBeenCalledWith('lattice-NBaJ8e')
})

it('keeps unpaired and failed connections fail-closed', async () => {
  const updateLattice = spyOn(store.getState(), 'updateLattice')
  const expectProjection = (paired: boolean) => {
    expect(calls<[string, { paired: boolean }]>(updateLattice)).toEqual([['NBaJ8e', { paired }]])
    updateLattice.mockClear()
  }
  const updates = mock()
  signer.connect.mockRejectedValue(new Error('relay unavailable'))
  adapter.on('update', updates)
  adapter.open()
  setDevices({ NBaJ8e: device(signer, true) })
  await Promise.resolve()
  await Promise.resolve()
  expectProjection(false)

  signer.connection = { baseUrl: 'https://signing.gridpl.us', isPaired: false }
  signer.emit('connect', false)
  expectProjection(false)
  signer.emit('paired', false)
  expectProjection(true)
  expect(signer.deriveAddresses).not.toHaveBeenCalled()
  signer.emit('error')
  expectProjection(false)
  expect(signer.disconnect).toHaveBeenCalledTimes(1)
  expect(updates).toHaveBeenCalledWith(signer)
})
