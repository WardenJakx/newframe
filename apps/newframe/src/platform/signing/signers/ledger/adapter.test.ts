import { afterAll, afterEach, beforeAll, beforeEach, expect, it, jest as timers, mock } from 'bun:test'
import EventEmitter from 'events'

import log from 'electron-log'
import { v5 as uuid } from 'uuid'

import store from '../../../state-store'
import type LedgerSignerAdapterType from './adapter'

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

  open = mock(async (): Promise<void> => undefined)

  connect = mock(async () => {
    this.status = Status.OK
    this.emit('update')
  })

  disconnect = mock(async () => {
    if (this.status === Status.OK) {
      this.status = Status.DISCONNECTED
      this.emit('update')
    }
  })

  close = mock(async () => {
    this.emit('close')
  })

  deriveAddresses = mock()

  updateStatus(status: string) {
    this.status = status
  }
}

const TransportNodeHidSingletonMock = {
  listen: mock(() => ({ unsubscribe: mock() }))
}

interface ConnectedHid {
  interface: number
  path: string
  product: string
  usagePage: number
}

type PublicAdapter = {
  [Key in keyof LedgerSignerAdapterType]: LedgerSignerAdapterType[Key]
}

type TestAdapter = Omit<PublicAdapter, 'reload'> & {
  disconnections: Array<{ device: LedgerMock; timeout: NodeJS.Timeout }>
  handleDeviceChanges(): void
  handleDisconnectedDevice(device: LedgerMock): void
  knownSigners: Record<string, LedgerMock>
  reload(device: LedgerMock): void
}

let connectedHids: ConnectedHid[] = []

await mock.module('./dependencies.js', () => ({
  getLedgerDevices: () => connectedHids,
  TransportNodeHidSingleton: TransportNodeHidSingletonMock
}))

await mock.module('./Ledger/index.js', () => ({
  default: LedgerMock,
  Status
}))

function simulateLedgerConnection(path: string) {
  connectedHids.push({ interface: 0, product: 'Nano S', usagePage: 0xffa0, path })
}

function simulateLedgerDisconnection(path: string) {
  const hidIndex = connectedHids.findIndex((hid) => hid.path === path)
  connectedHids.splice(hidIndex, 1)
}

let LedgerSignerAdapter: typeof LedgerSignerAdapterType
let adapter: TestAdapter

beforeAll(async () => {
  timers.useFakeTimers()
  log.transports.console.level = false

  LedgerSignerAdapter = (await import('./adapter')).default
})

beforeEach(() => {
  connectedHids = []
  store.getState().clearHomeCommand()

  adapter = new LedgerSignerAdapter(store) as unknown as TestAdapter
  adapter.open()
})

afterEach(() => {
  adapter.close()
  store.getState().clearHomeCommand()
})

afterAll(() => {
  timers.useRealTimers()
  log.transports.console.level = 'debug'
})

function nextEvent<T = unknown>(event: string, predicate: (value: T) => boolean = () => true) {
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

async function flushConnection() {
  for (let i = 0; i < 12; i++) {
    await Promise.resolve()
  }
}

for (const status of [Status.WRONG_APP, Status.NEEDS_RECONNECTION]) {
  it(`recovers from ${status} without account setup or another USB event`, async () => {
    store.getState().navHome({ view: 'settings' })
    const homeCommand = store.getState().tray.homeCommand
    const added = nextEvent<LedgerMock>('add')
    adapter.once('add', (ledger: LedgerMock) => {
      ledger.connect.mockImplementationOnce(async () => {
        ledger.status = status
        ledger.emit('update')
      })
    })
    simulateLedgerConnection('nano-s-path')
    adapter.handleDeviceChanges()
    const ledger = await added
    await flushConnection()
    expect(ledger.status).toBe(status)

    timers.advanceTimersByTime(2000)
    await flushConnection()

    expect(ledger.status).toBe(Status.OK)
    expect(adapter.knownSigners['nano-s-path']).toBe(ledger)
    expect(store.getState().tray.homeCommand).toEqual(homeCommand)
  })
}

it('retries a failed transport open and serializes automatic and manual reconnects', async () => {
  const added = nextEvent<LedgerMock>('add')
  adapter.once('add', (ledger: LedgerMock) => {
    ledger.open.mockRejectedValueOnce(new Error('Device is busy'))
  })
  simulateLedgerConnection('nano-s-path')
  adapter.handleDeviceChanges()
  const ledger = await added
  await flushConnection()
  expect(ledger.status).toBe(Status.NEEDS_RECONNECTION)

  let finishOpen!: () => void
  ledger.open.mockImplementationOnce(() => new Promise<void>((resolve) => (finishOpen = resolve)))
  timers.advanceTimersByTime(2000)
  await flushConnection()
  adapter.reload(ledger)
  timers.advanceTimersByTime(2000)
  await flushConnection()
  expect(ledger.status).toBe(Status.NEEDS_RECONNECTION)
  finishOpen()
  await flushConnection()
  expect(ledger.status).toBe(Status.OK)
})

it('backs off repeated failures to one minute and resets after a successful connection', async () => {
  const added = nextEvent<LedgerMock>('add')
  const statuses: string[] = []
  adapter.on('update', (ledger: LedgerMock) => statuses.push(ledger.status))
  let fail = true
  adapter.once('add', (ledger: LedgerMock) => {
    ledger.connect.mockImplementation(async () => {
      ledger.status = fail ? Status.NEEDS_RECONNECTION : Status.OK
      ledger.emit('update')
    })
  })
  simulateLedgerConnection('nano-s-path')
  adapter.handleDeviceChanges()
  const ledger = await added
  await flushConnection()

  const expectedStatuses = [Status.NEEDS_RECONNECTION]
  for (const delay of [2000, 4000, 8000, 16000, 32000, 60000, 60000]) {
    timers.advanceTimersByTime(delay - 1)
    await flushConnection()
    expect(statuses).toEqual(expectedStatuses)
    timers.advanceTimersByTime(1)
    await flushConnection()
    expectedStatuses.push(Status.NEEDS_RECONNECTION)
    expect(statuses).toEqual(expectedStatuses)
  }

  fail = false
  timers.advanceTimersByTime(60000)
  await flushConnection()
  expect(ledger.status).toBe(Status.OK)
  expectedStatuses.push(Status.OK)
  timers.advanceTimersByTime(120000)
  await flushConnection()
  expect(statuses).toEqual(expectedStatuses)

  fail = true
  ledger.status = Status.NEEDS_RECONNECTION
  ledger.emit('update')
  expectedStatuses.push(Status.NEEDS_RECONNECTION)
  timers.advanceTimersByTime(1999)
  await flushConnection()
  expect(statuses).toEqual(expectedStatuses)
  timers.advanceTimersByTime(1)
  await flushConnection()
  expect(statuses).toEqual([...expectedStatuses, Status.NEEDS_RECONNECTION])
})

for (const trigger of ['USB reconnection', 'manual reconnect']) {
  it(`connects immediately and resets backoff on ${trigger}`, async () => {
    const added = nextEvent<LedgerMock>('add')
    const statuses: string[] = []
    adapter.on('update', (ledger: LedgerMock) => statuses.push(ledger.status))
    adapter.once('add', (ledger: LedgerMock) => {
      ledger.connect.mockImplementation(async () => {
        ledger.status = Status.WRONG_APP
        ledger.emit('update')
      })
    })
    simulateLedgerConnection('nano-s-path')
    adapter.handleDeviceChanges()
    const ledger = await added
    await flushConnection()
    timers.advanceTimersByTime(2000)
    await flushConnection()
    expect(statuses).toEqual([Status.WRONG_APP, Status.WRONG_APP])

    if (trigger === 'USB reconnection') {
      simulateLedgerDisconnection('nano-s-path')
      adapter.handleDeviceChanges()
      simulateLedgerConnection('nano-s-path')
      adapter.handleDeviceChanges()
    } else {
      adapter.reload(ledger)
    }
    await flushConnection()
    expect(statuses).toEqual([Status.WRONG_APP, Status.WRONG_APP, Status.WRONG_APP])
    timers.advanceTimersByTime(2000)
    await flushConnection()
    const expectedStatuses = [Status.WRONG_APP, Status.WRONG_APP, Status.WRONG_APP, Status.WRONG_APP]
    expect(statuses).toEqual(expectedStatuses)
    timers.advanceTimersByTime(2000)
    await flushConnection()
    expect(statuses).toEqual(expectedStatuses)
  })
}

for (const trigger of ['USB removal', 'adapter shutdown']) {
  it(`cancels a pending retry on ${trigger}`, async () => {
    const added = nextEvent<LedgerMock>('add')
    const statuses: string[] = []
    adapter.on('update', (ledger: LedgerMock) => statuses.push(ledger.status))
    adapter.once('add', (ledger: LedgerMock) => {
      ledger.connect.mockImplementation(async () => {
        ledger.status = Status.WRONG_APP
        ledger.emit('update')
      })
    })
    simulateLedgerConnection('nano-s-path')
    adapter.handleDeviceChanges()
    await added
    await flushConnection()
    if (trigger === 'USB removal') {
      simulateLedgerDisconnection('nano-s-path')
      adapter.handleDeviceChanges()
    } else {
      adapter.close()
    }
    timers.advanceTimersByTime(2000)
    await flushConnection()
    expect(statuses).toEqual([Status.WRONG_APP])
  })
}

it('connects a Ledger after startup without changing navigation', async () => {
  store.getState().navHome({ view: 'settings' })
  const homeCommand = store.getState().tray.homeCommand
  const connected = nextEvent<LedgerMock>('update', (ledger) => ledger.status === Status.OK)

  simulateLedgerConnection('nano-s-path')
  adapter.handleDeviceChanges()

  const ledger = await connected
  expect(ledger.devicePath).toBe('nano-s-path')
  expect(store.getState().tray.homeCommand).toEqual(homeCommand)
})

it('creates a new Ledger when one is already attached', () => {
  const addedLedgers: LedgerMock[] = []
  adapter.on('add', (ledger: LedgerMock) => addedLedgers.push(ledger))

  simulateLedgerConnection('connected-nano-s-path')
  adapter.handleDeviceChanges()
  simulateLedgerConnection('new-nano-s-path')
  adapter.handleDeviceChanges()

  expect(addedLedgers.map(({ devicePath }) => devicePath)).toEqual([
    'connected-nano-s-path',
    'new-nano-s-path'
  ])
})

it('handles a disconnected Ledger', async () => {
  const connected = nextEvent<LedgerMock>('update', (ledger) => ledger.status === Status.OK)
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

it('connects existing Ledgers at startup without opening account setup', async () => {
  adapter.close()
  const ledgers: LedgerMock[] = []
  adapter.on('add', (ledger: LedgerMock) => ledgers.push(ledger))
  const connected = nextEvent<LedgerMock>(
    'update',
    (ledger) => ledger.devicePath === 'nano-x-path' && ledger.status === Status.OK
  )

  simulateLedgerConnection('nano-s-path')
  simulateLedgerConnection('nano-x-path')
  adapter.open()
  adapter.handleDeviceChanges()
  adapter.handleDeviceChanges()
  await connected

  expect(ledgers.map(({ devicePath }) => devicePath)).toEqual(['nano-s-path', 'nano-x-path'])
  expect(ledgers.every((ledger) => ledger.status === Status.OK)).toBe(true)
  expect(store.getState().tray.homeCommand).toBeNull()
})

for (const platform of ['Linux', 'Windows']) {
  const expectedReconnectionPath = platform === 'Linux' ? 'nano-x-eth-app-path' : 'nano-x2-eth-app-path'

  it(`updates an existing Ledger when the eth app is exited on ${platform}`, async () => {
    const connected = nextEvent<LedgerMock>('update', (ledger) => ledger.status === Status.OK)
    simulateLedgerConnection('nano-x-eth-app-path')
    adapter.handleDeviceChanges()
    const ledger = await connected
    const statuses: string[] = []
    let additions = 0
    let removals = 0
    adapter.on('add', () => additions++)
    adapter.on('remove', () => removals++)
    adapter.on('update', (value: LedgerMock) => statuses.push(value.status))
    const reconnected = nextEvent<LedgerMock>(
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
    expect(store.getState().tray.homeCommand).toBeNull()
  })
}
