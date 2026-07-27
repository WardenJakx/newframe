import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test'
import { EventEmitter } from 'events'
import log from 'electron-log'

import LatticeSignerAdapter from './adapter'
import store from '../../store'
import createCanonicalStore from '../../store/createCanonicalStore'

type FakeSigner = EventEmitter & {
  id: string
  deviceId: string
  deviceName: string
  accountLimit: number
  derivation: string
  addresses: string[]
  connection?: { baseUrl: string; isPaired?: boolean }
  connect: ReturnType<typeof mock>
  disconnect: ReturnType<typeof mock>
  deriveAddresses: ReturnType<typeof mock>
  close: ReturnType<typeof mock>
}

type TestAdapter = {
  adapterType: string
  knownSigners: Record<string, FakeSigner>
  unsubscribeSettings?: () => void
  unsubscribeSigners?: () => void
  open(): void
  close(): void
  remove(signer: FakeSigner): void
  reload(signer: FakeSigner): Promise<void>
  on(event: string, listener: (value: unknown) => void): unknown
}

function mockCalls<TArgs extends unknown[]>(fn: unknown) {
  return (fn as { mock: { calls: TArgs[] } }).mock.calls
}

function createFakeSigner(deviceId = 'NBaJ8e', deviceName = 'Newframe-testlattice') {
  const signer = new EventEmitter() as FakeSigner
  signer.id = `lattice-${deviceId}`
  signer.deviceId = deviceId
  signer.deviceName = deviceName
  signer.accountLimit = 5
  signer.derivation = 'legacy'
  signer.addresses = Array(5).fill('addr')
  signer.connect = mock(async () => true)
  signer.disconnect = mock()
  signer.deriveAddresses = mock()
  signer.close = mock()
  return signer
}

function setDevices(
  devices: Record<string, { deviceName: string; tag: string; privKey: string; paired: boolean }>
) {
  store.setState((state) => {
    state.main.lattice = devices
  })
}

function setSettings(
  update: Partial<{
    accountLimit: number
    derivation: 'legacy' | 'standard'
    endpointMode: 'default' | 'standard' | 'custom'
    endpointCustom: string
  }>
) {
  store.setState((state) => {
    Object.assign(state.main.latticeSettings, update)
  })
}

let signer: FakeSigner
let adapter: TestAdapter

beforeAll(() => {
  log.transports.console.level = false
})

afterAll(() => {
  log.transports.console.level = 'debug'
})

beforeEach(() => {
  setDevices({})
  setSettings({
    accountLimit: 5,
    derivation: 'legacy',
    endpointMode: 'default',
    endpointCustom: ''
  })
  signer = createFakeSigner()
  adapter = new LatticeSignerAdapter(store, () => signer as never) as unknown as TestAdapter
})

afterEach(() => {
  adapter.close()
})

it('opens and closes both store subscriptions as one adapter lifecycle', () => {
  expect(adapter.adapterType).toBe('lattice')

  adapter.open()
  expect({
    settingsSubscription: typeof adapter.unsubscribeSettings,
    signerSubscription: typeof adapter.unsubscribeSigners
  }).toStrictEqual({
    settingsSubscription: 'function',
    signerSubscription: 'function'
  })

  adapter.close()
  expect({
    settingsSubscription: adapter.unsubscribeSettings,
    signerSubscription: adapter.unsubscribeSigners,
    knownSigners: adapter.knownSigners
  }).toStrictEqual({
    settingsSubscription: undefined,
    signerSubscription: undefined,
    knownSigners: {}
  })
})

it('ignores a pending paired-device connection failure after close and reopen', async () => {
  const memoryStorage = {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined
  }
  const freshStore = createCanonicalStore(memoryStorage).store
  const firstSigner = createFakeSigner('fresh-device')
  const reopenedSigner = createFakeSigner('fresh-device')
  let rejectFirstConnection: (error: Error) => void = () => {}
  firstSigner.connect = mock(
    () =>
      new Promise<boolean>((_resolve, reject) => {
        rejectFirstConnection = reject
      })
  )
  const createdSigners = [firstSigner, reopenedSigner]
  const freshAdapter = new LatticeSignerAdapter(freshStore, () => createdSigners.shift() as never)
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
  freshAdapter.close()
  freshAdapter.open()
  rejectFirstConnection(new Error('late relay failure'))
  await Promise.resolve()
  await Promise.resolve()

  expect({
    firstConnections: firstSigner.connect.mock.calls.length,
    reopenedConnections: reopenedSigner.connect.mock.calls.length,
    paired: freshStore.getState().main.lattice['fresh-device'].paired
  }).toStrictEqual({
    firstConnections: 1,
    reopenedConnections: 1,
    paired: true
  })

  freshAdapter.close()
})

it('removes persisted devices and closes only a known active signer', () => {
  const unknown = createFakeSigner('unknown')
  adapter.remove(unknown)
  expect(unknown.close).not.toHaveBeenCalled()

  adapter.knownSigners[signer.deviceId] = signer
  adapter.remove(signer)

  expect(mockCalls<[string]>(store.getState().removeLattice).map(([deviceId]) => deviceId)).toStrictEqual([
    'unknown',
    'NBaJ8e'
  ])
  expect(signer.close).toHaveBeenCalledTimes(1)
})

it('reloads a signer against the current endpoint and private key', async () => {
  setDevices({
    NBaJ8e: {
      deviceName: signer.deviceName,
      tag: 'ABCXYZ',
      privKey: 'supersecretkey',
      paired: true
    }
  })

  await adapter.reload(signer)

  expect({
    disconnects: signer.disconnect.mock.calls.length,
    connections: signer.connect.mock.calls
  }).toStrictEqual({
    disconnects: 1,
    connections: [['https://signing.gridpl.us', 'supersecretkey']]
  })
})

describe('settings transitions', () => {
  beforeEach(() => {
    setDevices({
      NBaJ8e: {
        deviceName: signer.deviceName,
        tag: 'ABCXYZ',
        privKey: 'supersecretkey',
        paired: false
      }
    })
    signer.connection = { baseUrl: 'https://signing.gridpl.us' }
    adapter.open()
    signer.connect.mockClear()
    signer.disconnect.mockClear()
    signer.deriveAddresses.mockClear()
  })

  it('does not reconnect without a connection or when the endpoint is unchanged', () => {
    delete signer.connection
    setSettings({ endpointMode: 'custom', endpointCustom: 'https://myendpoint.io' })

    signer.connection = { baseUrl: 'https://signing.gridpl.us' }
    setSettings({
      endpointMode: 'custom',
      endpointCustom: 'https://signing.gridpl.us'
    })

    expect({
      connects: signer.connect.mock.calls,
      disconnects: signer.disconnect.mock.calls
    }).toStrictEqual({ connects: [], disconnects: [] })
  })

  it('reconnects to changed custom and default endpoints', async () => {
    setSettings({ endpointMode: 'custom', endpointCustom: 'https://myendpoint.io' })
    await Promise.resolve()

    signer.connection = { baseUrl: 'https://customendpoint.io' }
    setSettings({ endpointMode: 'standard', endpointCustom: 'https://customendpoint.io' })
    await Promise.resolve()

    expect(signer.connect.mock.calls).toStrictEqual([
      ['https://myendpoint.io', 'supersecretkey'],
      ['https://signing.gridpl.us', 'supersecretkey']
    ])
    expect(signer.disconnect).toHaveBeenCalledTimes(2)
  })

  it('derives addresses for derivation changes and account-limit expansion', () => {
    setSettings({ derivation: 'standard' })
    setSettings({ accountLimit: 10 })

    expect(signer.deriveAddresses).toHaveBeenCalledTimes(2)
    expect({
      derivation: signer.derivation,
      accountLimit: signer.accountLimit
    }).toStrictEqual({ derivation: 'standard', accountLimit: 10 })
  })

  it('publishes a display update when the account limit shrinks without derivation', () => {
    signer.accountLimit = 10
    const updates: FakeSigner[] = []
    adapter.on('update', (updatedSigner) => updates.push(updatedSigner as FakeSigner))

    setSettings({ accountLimit: 4 })

    expect(signer.deriveAddresses).not.toHaveBeenCalled()
    expect(updates).toStrictEqual([signer])
  })
})

describe('device lifecycle', () => {
  function addDevice(paired: boolean) {
    setDevices({
      NBaJ8e: {
        deviceName: signer.deviceName,
        tag: 'ABCXYZ',
        privKey: 'supersecretkey',
        paired
      }
    })
  }

  beforeEach(() => {
    adapter.open()
  })

  it('creates, publishes, and connects a newly persisted paired device', () => {
    const additions: FakeSigner[] = []
    adapter.on('add', (addedSigner) => additions.push(addedSigner as FakeSigner))

    addDevice(true)

    expect({
      known: adapter.knownSigners,
      additions,
      connections: signer.connect.mock.calls
    }).toStrictEqual({
      known: { NBaJ8e: signer },
      additions: [signer],
      connections: [['https://signing.gridpl.us', 'supersecretkey']]
    })
  })

  it('does not recreate known devices or auto-connect unpaired devices', () => {
    adapter.knownSigners.NBaJ8e = signer
    addDevice(false)

    expect(adapter.knownSigners).toStrictEqual({ NBaJ8e: signer })
    expect(signer.connect).not.toHaveBeenCalled()
  })

  it('marks a paired device unpaired when automatic connection fails', async () => {
    signer.connect.mockRejectedValue(new Error('relay unavailable'))

    addDevice(true)
    await Promise.resolve()
    await Promise.resolve()

    expect(store.getState().updateLattice).toHaveBeenCalledWith('NBaJ8e', {
      paired: false
    })
  })

  it('handles connected and paired events as cohesive state transitions', () => {
    addDevice(false)
    signer.emit('connect', true)
    signer.emit('paired', true)

    expect(mockCalls<[string, { paired: boolean }]>(store.getState().updateLattice)).toStrictEqual([
      ['NBaJ8e', { paired: true }],
      ['NBaJ8e', { paired: true }]
    ])
    expect(signer.deriveAddresses).toHaveBeenCalledTimes(2)
  })

  it('does not derive addresses for unpaired connections or pairing without an active wallet', () => {
    addDevice(false)
    signer.emit('connect', false)
    signer.emit('paired', false)

    expect(mockCalls<[string, { paired: boolean }]>(store.getState().updateLattice)).toStrictEqual([
      ['NBaJ8e', { paired: false }],
      ['NBaJ8e', { paired: true }]
    ])
    expect(signer.deriveAddresses).not.toHaveBeenCalled()
  })

  it('disconnects, updates pairing state, and publishes the signer after an error', () => {
    const updates: FakeSigner[] = []
    addDevice(false)
    signer.connection = { baseUrl: 'https://signing.gridpl.us', isPaired: false }
    adapter.on('update', (updatedSigner) => updates.push(updatedSigner as FakeSigner))

    signer.emit('error')

    expect(store.getState().updateLattice).toHaveBeenCalledWith('NBaJ8e', {
      paired: false
    })
    expect(signer.disconnect).toHaveBeenCalledTimes(1)
    expect(updates).toStrictEqual([signer])
  })

  it('forwards signer updates and removes closed devices from the adapter', () => {
    const updates: FakeSigner[] = []
    const removals: string[] = []
    addDevice(false)
    adapter.on('update', (updatedSigner) => updates.push(updatedSigner as FakeSigner))
    adapter.on('remove', (id) => removals.push(id as string))

    signer.emit('update')
    signer.emit('close')

    expect({
      updates,
      removals,
      knownSigners: adapter.knownSigners
    }).toStrictEqual({
      updates: [signer],
      removals: ['lattice-NBaJ8e'],
      knownSigners: {}
    })
  })
})
