import os from 'os'
import log from 'electron-log'
import HID from 'node-hid'
// @ts-expect-error - usb-detection ships no type declarations
import usbDetect from 'usb-detection'

import LedgerSignerAdapter from '../../../../main/signers/ledger/adapter'
import { Status } from '../../../../main/signers/ledger/Ledger'

jest.mock('node-hid')

jest.mock('../../../../main/store/persist')

jest.mock('../../../../main/signers/ledger/Ledger', () => {
  const L = jest.requireActual('../../../../main/signers/ledger/Ledger')

  const constructor = function (devicePath: any, model: any) {
    const ledger = new L.default(devicePath, model)
    ledger.open = async function () {
      /* noop */
    }

    ledger.connect = async function () {
      this.status = L.Status.OK
      this.emit('update')
    }

    ledger.disconnect = async function () {
      this.status = L.Status.DISCONNECTED
      this.emit('update')
    }

    ledger.close = async function () {
      this.emit('close')
    }

    return ledger
  }

  return { __esModule: true, default: constructor, Status: L.Status }
})

function simulateLedgerConnection(path: any) {
  connectedHids.push({ interface: 0, product: 'Nano S', usagePage: 0xffa0, path })
}

function simulateLedgerDisconnection(path: any) {
  const hidIndex = connectedHids.findIndex((hid: any) => hid.path === path)
  connectedHids.splice(hidIndex, 1)
}

let adapter: any, connectedHids: any

beforeAll(() => {
  jest.useFakeTimers()
  log.transports.console.level = false
})

beforeEach(() => {
  ;(HID.devices as any).mockImplementation(() => connectedHids)
  connectedHids = []

  adapter = new LedgerSignerAdapter()
  adapter.open()
})

afterEach(() => {
  adapter.close()
})

afterAll(() => {
  if (os.platform().toLowerCase() !== 'linux') {
    // calling stopMonitoring() causes a segmentation fault on Linux
    // https://github.com/MadLittleMods/node-usb-detection/issues/57
    usbDetect.stopMonitoring()
  }

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
