import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test'
import { EventEmitter } from 'events'

import log from 'electron-log'

const trezorEvents = new EventEmitter()
const DEVICE_EVENT = 'DEVICE_EVENT'
const UI_EVENT = 'UI_EVENT'
const DEVICE = {
  CHANGED: 'device-changed',
  CONNECT: 'device-connect',
  CONNECT_UNACQUIRED: 'device-connect_unacquired',
  DISCONNECT: 'device-disconnect'
}
const UI = {
  RECEIVE_PASSPHRASE: 'ui-receive_passphrase',
  RECEIVE_PIN: 'ui-receive_pin',
  REQUEST_PASSPHRASE: 'ui-request_passphrase',
  REQUEST_PIN: 'ui-request_pin'
}
const TrezorConnectMock = {
  dispose: mock(),
  emit: trezorEvents.emit.bind(trezorEvents),
  ethereumGetAddress: mock(),
  ethereumSignMessage: mock(),
  ethereumSignTransaction: mock(),
  ethereumSignTypedData: mock(),
  getAccountInfo: mock(),
  getFeatures: mock(),
  getPublicKey: mock(),
  init: mock(async () => undefined),
  on: trezorEvents.on.bind(trezorEvents),
  once: trezorEvents.once.bind(trezorEvents),
  removeAllListeners: trezorEvents.removeAllListeners.bind(trezorEvents),
  uiResponse: mock()
}

await mock.module('@trezor/connect', () => ({
  default: TrezorConnectMock,
  DEVICE,
  DEVICE_EVENT,
  UI,
  UI_EVENT
}))

const TrezorConnect = TrezorConnectMock
let TrezorBridge: typeof import('./bridge').default

beforeAll(async () => {
  log.transports.console.level = false

  TrezorBridge = (await import('./bridge')).default
})

afterAll(() => {
  log.transports.console.level = 'debug'
})

beforeEach((done) => {
  TrezorBridge.once('connect', done)
  void TrezorBridge.open()
})

afterEach(() => {
  TrezorBridge.close()
})

describe('connect events', () => {
  it('emits a detected event on device changed event with type unacquired', (done) => {
    TrezorBridge.once('trezor:detected', (path: string) => {
      try {
        expect(path).toBe('27')
        done()
      } catch (e) {
        done(e)
      }
    })
    TrezorConnect.emit(DEVICE_EVENT, {
      type: DEVICE.CHANGED,
      payload: { type: 'unacquired', path: '27', features: {} }
    })
  })

  it('emits a detected event on device unacquired event', (done) => {
    TrezorBridge.once('trezor:detected', (path: string) => {
      try {
        expect(path).toBe('27')
        done()
      } catch (e) {
        done(e)
      }
    })
    TrezorConnect.emit(DEVICE_EVENT, {
      type: DEVICE.CONNECT_UNACQUIRED,
      payload: { type: 'unacquired', path: '27', features: {} }
    })
  })

  it('emits a connected event on device connected event with type acquired', (done) => {
    const payload = { type: 'acquired', path: '27', features: { firmwareVersion: '2.1.4' } }

    TrezorBridge.once('trezor:connect', (device: typeof payload) => {
      try {
        expect(device).toEqual(payload)
        done()
      } catch (e) {
        done(e)
      }
    })
    TrezorConnect.emit(DEVICE_EVENT, { type: DEVICE.CONNECT, payload })
  })

  it('emits a disconnected event on device disconnected event', (done) => {
    const payload = { type: 'acquired', path: '27', features: { firmwareVersion: '2.1.4' } }

    TrezorBridge.once('trezor:disconnect', (device: typeof payload) => {
      try {
        expect(device).toEqual(payload)
        done()
      } catch (e) {
        done(e)
      }
    })
    TrezorConnect.emit(DEVICE_EVENT, { type: DEVICE.DISCONNECT, payload })
  })

  it('emits an updated event on device changed event where type is not unacquired', (done) => {
    const payload = { type: 'acquired', path: '27', features: { firmwareVersion: '2.1.4' } }

    TrezorBridge.once('trezor:update', (device: typeof payload) => {
      try {
        expect(device).toEqual(payload)
        done()
      } catch (e) {
        done(e)
      }
    })
    TrezorConnect.emit(DEVICE_EVENT, { type: DEVICE.CHANGED, payload })
  })
})

describe('ui events', () => {
  it('emits a needPin event when a pin is requested', (done) => {
    const device = { type: 'acquired', id: 'someid1234' }
    type ExpectedDevice = typeof device

    TrezorBridge.once('trezor:needPin', (device: ExpectedDevice) => {
      try {
        expect(device).toEqual(device)
        done()
      } catch (e) {
        done(e)
      }
    })
    TrezorConnect.emit(UI_EVENT, { type: UI.REQUEST_PIN, payload: { device } })
  })

  it('emits a needPhrase event when a passphrase is requested and entry on the device is not supported', (done) => {
    const device = { type: 'acquired', id: 'someid1234' }
    const payload = { device, features: { capabilities: [] } }
    type ExpectedDevice = typeof device

    TrezorBridge.once('trezor:needPhrase', (device: ExpectedDevice) => {
      try {
        expect(device).toEqual(device)
        done()
      } catch (e) {
        done(e)
      }
    })
    TrezorConnect.emit(UI_EVENT, { type: UI.REQUEST_PASSPHRASE, payload })
  })
})

describe('requests', () => {
  it('loads features for a given device', async () => {
    const features = {
      vendor: 'trezor.io',
      device_id: 'G89EDFE91829DACC6B43'
    } as unknown as Awaited<ReturnType<typeof TrezorBridge.getFeatures>>

    TrezorConnect.getFeatures.mockImplementation(async (params: { device: { path: string } }) => {
      expect(params.device.path).toBe('41')
      return { id: 1, success: true, payload: features }
    })

    const loadedFeatures = await TrezorBridge.getFeatures({
      device: { path: '41' }
    } as Parameters<typeof TrezorBridge.getFeatures>[0])

    expect(loadedFeatures).toEqual(features)
  })

  it('gets the public key for a given device', async () => {
    const key = {
      chainCode: 'eth',
      fingerprint: 19912902490
    } as unknown as Awaited<ReturnType<typeof TrezorBridge.getPublicKey>>

    TrezorConnect.getPublicKey.mockImplementation(
      async (params: { device: { path: string }; path: string }) => {
        expect(params.device.path).toBe('4')
        expect(params.path).toBe("m/44'/60'/0/1/0")
        return { id: 1, success: true, payload: key }
      }
    )

    const publicKey = await TrezorBridge.getPublicKey(
      { path: '4' } as Parameters<typeof TrezorBridge.getPublicKey>[0],
      "m/44'/60'/0/1/0"
    )

    expect(publicKey).toEqual(key)
  })

  it('gets the signature after signing a transaction', async () => {
    const tx = {
      chainId: '0x4',
      type: '0x2',
      value: '0x1929'
    } as unknown as Parameters<typeof TrezorBridge.signTransaction>[2]

    TrezorConnect.ethereumSignTransaction.mockImplementation(
      async (params: { device: { path: string }; path: string; transaction: unknown }) => {
        expect(params.device.path).toBe('11')
        expect(params.path).toBe("m/44'/60'/0'/4/0")
        expect(params.transaction).toEqual(tx)
        return {
          id: 1,
          success: true,
          payload: { v: 1, r: 2, s: 3 } as unknown as Awaited<ReturnType<typeof TrezorBridge.signTransaction>>
        }
      }
    )

    const signature = await TrezorBridge.signTransaction(
      { path: '11' } as Parameters<typeof TrezorBridge.signTransaction>[0],
      "m/44'/60'/0'/4/0",
      tx
    )

    expect(signature as unknown).toEqual({ v: 1, r: 2, s: 3 })
  })
})
