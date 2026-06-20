import EventEmitter from 'events'
import log from 'electron-log'
import { v5 as uuid } from 'uuid'

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

  constructor(public devicePath: string, public model: string) {
    super()
    this.id = uuid('Ledger' + this.devicePath, ns)
  }

  open = jest.fn(async () => undefined)

  connect = jest.fn(async () => {
    this.status = Status.OK
    this.emit('update')
  })

  disconnect = jest.fn(async () => {
    this.status = Status.DISCONNECTED
    this.emit('update')
  })

  close = jest.fn(async () => {
    this.emit('close')
  })

  deriveAddresses = jest.fn()
}

const TransportNodeHidSingletonMock = {
  listen: jest.fn(() => ({ unsubscribe: jest.fn() }))
}

let connectedHids: any[] = []

jest.mock('@ledgerhq/hw-transport-node-hid-noevents', () => ({
  getDevices: () => connectedHids
}))

jest.mock('@ledgerhq/hw-transport-node-hid-singleton', () => ({
  default: TransportNodeHidSingletonMock
}))

jest.mock('../../../../main/signers/ledger/Ledger', () => ({
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
  jest.useFakeTimers()
  log.transports.console.level = false

  LedgerSignerAdapter = (await import('../../../../main/signers/ledger/adapter')).default
})

beforeEach(() => {
  connectedHids = []

  adapter = new LedgerSignerAdapter()
  adapter.open()
})

afterEach(() => {
  adapter.close()
})

afterAll(() => {
  jest.useRealTimers()
  log.transports.console.level = 'debug'
})

it('recognizes a connected Ledger', (done) => {
  adapter.once('add', (ledger: any) => {
    try {
      expect(ledger.devicePath).toBe('nano-s-path')
      done()
    } catch (e) {
      done(e)
    }
  })

  simulateLedgerConnection('nano-s-path')
  adapter.handleDeviceChanges()
})

it('creates a new Ledger when one is already attached', (done) => {
  const addedLedgers: any = []

  adapter.on('add', (ledger: any) => {
    addedLedgers.push(ledger)

    if (addedLedgers.length === 2) {
      try {
        expect(addedLedgers[0].devicePath).toBe('connected-nano-s-path')
        expect(addedLedgers[1].devicePath).toBe('new-nano-s-path')
        done()
      } catch (e) {
        done(e)
      }
    }
  })

  simulateLedgerConnection('connected-nano-s-path')
  adapter.handleDeviceChanges()

  simulateLedgerConnection('new-nano-s-path')
  adapter.handleDeviceChanges()
})

it('handles a disconnected Ledger', (done) => {
  adapter.once('update', (ledger: any) => {
    if (ledger.status === Status.OK) {
      // ensure no Ledgers are added after the initial connection
      adapter.once('add', () => done('new Ledger should not be added!'))

      adapter.once('remove', (id: any) => {
        try {
          expect(id).toBe('88da20f4-2d91-5a86-b7ec-c86603d02ad8')
          expect(adapter.disconnections).toHaveLength(0)
          expect(Object.keys(adapter.knownSigners)).toHaveLength(0)
          done()
        } catch (e) {
          done(e)
        }
      })

      adapter.on('update', () => {
        try {
          expect(ledger.status).toBe(Status.DISCONNECTED)
        } catch (e) {
          done(e)
        }
      })

      simulateLedgerDisconnection('nano-x-discon-path')
      adapter.handleDeviceChanges()

      jest.advanceTimersByTime(5000)
    }
  })

  simulateLedgerConnection('nano-x-discon-path')
  adapter.handleDeviceChanges()
}, 200)

it('recognizes two newly connected Ledgers', (done) => {
  // this can happen on startup
  const ledgers: any = []

  adapter.on('add', (ledger: any) => {
    ledgers.push(ledger)

    if (ledgers.length === 2) {
      try {
        expect(ledgers[0].devicePath).toBe('nano-s-path')
        expect(ledgers[1].devicePath).toBe('nano-x-path')
      } catch (e) {
        done(e)
      }
    }
  })

  simulateLedgerConnection('nano-s-path')
  simulateLedgerConnection('nano-x-path')

  // on Windows we receive 2 events on startup, so simulate this and make
  // sure we only ever end up with 2 ledgers
  adapter.handleDeviceChanges()
  adapter.handleDeviceChanges()

  expect(ledgers).toHaveLength(2)
  expect(ledgers[0].devicePath).toBe('nano-s-path')
  expect(ledgers[1].devicePath).toBe('nano-x-path')
  done()
}, 200)

const platforms = ['Linux', 'Windows']

platforms.forEach((platform) => {
  // on Linux and Mac, the Ledger will re-connect using the same path as the one
  // that was disconnected. on Windows, it will have a different path
  const expectedReconnectionPath = platform === 'Linux' ? 'nano-x-eth-app-path' : 'nano-x2-eth-app-path'

  it(`updates an existing Ledger when the eth app is exited on ${platform}`, (done) => {
    let receivedDisconnect = false

    adapter.once('update', (ledger: any) => {
      if (ledger.status === Status.OK) {
        // ensure no Ledgers are added or removed
        adapter.once('add', () => done('new Ledger should not be added!'))
        adapter.once('remove', () => done('new Ledger should not be removed!'))
        adapter.on('update', (ledger: any) => {
          if (!receivedDisconnect && ledger.status === Status.DISCONNECTED) {
            return (receivedDisconnect = true)
          }

          try {
            expect(receivedDisconnect).toBe(true)
            expect(ledger.status).toBe(Status.OK)
            expect(ledger.devicePath).toBe(expectedReconnectionPath)
            expect(adapter.disconnections).toHaveLength(0)
            expect(Object.keys(adapter.knownSigners)).toHaveLength(1)
            expect(adapter.knownSigners[expectedReconnectionPath]).toBeDefined()
            done()
          } catch (e) {
            done(e)
          }
        })

        simulateLedgerDisconnection('nano-x-eth-app-path')
        adapter.handleDeviceChanges()

        simulateLedgerConnection(expectedReconnectionPath)
        adapter.handleDeviceChanges()
      }
    })

    simulateLedgerConnection('nano-x-eth-app-path')
    adapter.handleDeviceChanges()
  }, 200)
})
