import { afterAll, afterEach, beforeAll, beforeEach, expect, it, jest as timers, mock } from 'bun:test'

import EventEmitter from 'events'
import log from 'electron-log'
import { v5 as uuid } from 'uuid'
import store from '../../store'

const ns = '3bbcee75-cecc-5b56-8031-b6641c1ed1f1'

const Status = {
  INITIAL: 'Connecting',
  OK: 'ok',
  LOADING: 'loading',
  DERIVING: 'addresses',
  LOCKED: 'locked',
  WRONG_APP: 'Open your Ledger and select the Ethereum application',
  DISCONNECTED: 'Disconnected',
  NEEDS_RECONNECTION: 'Please reconnect this Ledger device'
}

class LedgerMock extends EventEmitter {
  id: string
  type = 'ledger'
  status = Status.INITIAL
  derivation: string | undefined
  accountLimit = 5

  constructor(
    public devicePath: string,
    public model: string
  ) {
    super()
    this.id = uuid('Ledger' + this.devicePath, ns)
  }

  open = mock(async () => undefined)

  connect = mock(async () => {
    this.status = Status.OK
    this.emit('update')
  })

  disconnect = mock(async () => {
    this.status = Status.DISCONNECTED
    this.emit('update')
  })

  close = mock(async () => {
    this.emit('close')
  })

  deriveAddresses = mock()
}

const TransportNodeHidSingletonMock = {
  listen: mock(() => ({ unsubscribe: mock() }))
}

let connectedHids: any[] = []

mock.module('./dependencies.js', () => ({
  getLedgerDevices: () => connectedHids,
  TransportNodeHidSingleton: TransportNodeHidSingletonMock
}))

mock.module('./Ledger/index.js', () => ({
  default: LedgerMock,
  Status
}))

function simulateLedgerConnection(path: any) {
  connectedHids.push({ interface: 0, product: 'Nano S', usagePage: 0xffa0, path })
}

function simulateLedgerDisconnection(path: any) {
  const hidIndex = connectedHids.findIndex((hid: any) => hid.path === path)
  connectedHids.splice(hidIndex, 1)
}

let LedgerSignerAdapter: any
let adapter: any

beforeAll(async () => {
  timers.useFakeTimers()
  log.transports.console.level = false

  LedgerSignerAdapter = (await import('./adapter')).default
})

beforeEach(() => {
  connectedHids = []

  adapter = new LedgerSignerAdapter(store)
  adapter.open()
})

afterEach(() => {
  adapter.close()
})

afterAll(() => {
  timers.useRealTimers()
  log.transports.console.level = 'debug'
})

function nextEvent<T = any>(event: string, predicate: (value: T) => boolean = () => true) {
  return new Promise<T>((resolve) => {
    const listener = (value: T) => {
      if (predicate(value)) {
        adapter.off(event, listener)
        resolve(value)
      }
    }
    adapter.on(event, listener)
  })
}

it('recognizes a connected Ledger', async () => {
  const added = nextEvent('add')

  simulateLedgerConnection('nano-s-path')
  adapter.handleDeviceChanges()

  expect((await added).devicePath).toBe('nano-s-path')
})

it('creates a new Ledger when one is already attached', () => {
  const addedLedgers: any = []
  adapter.on('add', (ledger: any) => addedLedgers.push(ledger))

  simulateLedgerConnection('connected-nano-s-path')
  adapter.handleDeviceChanges()
  simulateLedgerConnection('new-nano-s-path')
  adapter.handleDeviceChanges()

  expect(addedLedgers.map(({ devicePath }: any) => devicePath)).toEqual([
    'connected-nano-s-path',
    'new-nano-s-path'
  ])
})

it('handles a disconnected Ledger', async () => {
  const connected = nextEvent<any>('update', (ledger) => ledger.status === Status.OK)
  simulateLedgerConnection('nano-x-discon-path')
  adapter.handleDeviceChanges()
  const ledger = await connected
  const removed = nextEvent<string>('remove')
  let additions = 0
  adapter.on('add', () => additions++)

  simulateLedgerDisconnection('nano-x-discon-path')
  adapter.handleDeviceChanges()
  expect(ledger.status).toBe(Status.DISCONNECTED)
  timers.advanceTimersByTime(5000)

  expect(await removed).toBe('88da20f4-2d91-5a86-b7ec-c86603d02ad8')
  expect({
    additions,
    pending: adapter.disconnections.length,
    known: Object.keys(adapter.knownSigners)
  }).toEqual({
    additions: 0,
    pending: 0,
    known: []
  })
})

it('cancels pending disconnect removal when closed', () => {
  const ledger = new LedgerMock('closing-ledger-path', 'Nano X')
  adapter.knownSigners[ledger.devicePath] = ledger

  adapter.handleDisconnectedDevice(ledger)
  adapter.close()
  adapter.close()
  timers.advanceTimersByTime(5_000)

  expect({
    pending: adapter.disconnections.length,
    signerStillOwned: adapter.knownSigners[ledger.devicePath] === ledger,
    signerCloseCalls: ledger.close.mock.calls.length
  }).toEqual({
    pending: 0,
    signerStillOwned: true,
    signerCloseCalls: 0
  })
})

it('deduplicates startup events for two newly connected Ledgers', () => {
  const ledgers: any = []
  adapter.on('add', (ledger: any) => ledgers.push(ledger))

  simulateLedgerConnection('nano-s-path')
  simulateLedgerConnection('nano-x-path')
  adapter.handleDeviceChanges()
  adapter.handleDeviceChanges()

  expect(ledgers.map(({ devicePath }: any) => devicePath)).toEqual(['nano-s-path', 'nano-x-path'])
})

for (const platform of ['Linux', 'Windows']) {
  const expectedReconnectionPath = platform === 'Linux' ? 'nano-x-eth-app-path' : 'nano-x2-eth-app-path'

  it(`updates an existing Ledger when the eth app is exited on ${platform}`, async () => {
    const connected = nextEvent<any>('update', (ledger) => ledger.status === Status.OK)
    simulateLedgerConnection('nano-x-eth-app-path')
    adapter.handleDeviceChanges()
    const ledger = await connected
    const statuses: string[] = []
    let additions = 0
    let removals = 0
    adapter.on('add', () => additions++)
    adapter.on('remove', () => removals++)
    adapter.on('update', (value: any) => statuses.push(value.status))
    const reconnected = nextEvent<any>(
      'update',
      (value) => statuses.includes(Status.DISCONNECTED) && value.status === Status.OK
    )

    simulateLedgerDisconnection('nano-x-eth-app-path')
    adapter.handleDeviceChanges()
    simulateLedgerConnection(expectedReconnectionPath)
    adapter.handleDeviceChanges()
    await reconnected

    expect({ additions, removals, statuses, path: ledger.devicePath }).toEqual({
      additions: 0,
      removals: 0,
      statuses: [Status.DISCONNECTED, Status.OK],
      path: expectedReconnectionPath
    })
    expect(adapter.disconnections).toHaveLength(0)
    expect(Object.keys(adapter.knownSigners)).toEqual([expectedReconnectionPath])
  })
}
