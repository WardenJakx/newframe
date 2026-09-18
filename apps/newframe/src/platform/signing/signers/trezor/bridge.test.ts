import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test'
import { EventEmitter } from 'events'

import type { CommonParams, Device } from '@trezor/connect'
import log from 'electron-log'

import type TrezorBridgeType from './bridge'

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
interface DevicePath {
  path: string
}
interface PublicKeyParams {
  device: DevicePath
  path: string
}
interface TransactionParams {
  device: DevicePath
  path: string
  transaction: {
    to: string | null
    value: string
    gasLimit: string
    nonce: string
    chainId: number
    maxFeePerGas: string
    maxPriorityFeePerGas: string
  }
}
const TrezorConnectMock = {
  dispose: mock(),
  emit: trezorEvents.emit.bind(trezorEvents),
  ethereumGetAddress: mock(),
  ethereumSignMessage: mock(),
  ethereumSignTransaction: mock(async (_params: TransactionParams): Promise<unknown> => undefined),
  ethereumSignTypedData: mock(),
  getAccountInfo: mock(),
  getFeatures: mock(async (_params: CommonParams): Promise<unknown> => undefined),
  getPublicKey: mock(async (_params: PublicKeyParams): Promise<unknown> => undefined),
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

let TrezorBridge: typeof TrezorBridgeType

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
    TrezorConnectMock.emit(DEVICE_EVENT, {
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
    TrezorConnectMock.emit(DEVICE_EVENT, {
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
    TrezorConnectMock.emit(DEVICE_EVENT, { type: DEVICE.CONNECT, payload })
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
    TrezorConnectMock.emit(DEVICE_EVENT, { type: DEVICE.DISCONNECT, payload })
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
    TrezorConnectMock.emit(DEVICE_EVENT, { type: DEVICE.CHANGED, payload })
  })
})

describe('ui events', () => {
  it('emits a needPin event when a pin is requested', (done) => {
    const device = { type: 'acquired', id: 'someid1234' }

    TrezorBridge.once('trezor:needPin', (receivedDevice: typeof device) => {
      try {
        expect(receivedDevice).toEqual(device)
        done()
      } catch (e) {
        done(e)
      }
    })
    TrezorConnectMock.emit(UI_EVENT, { type: UI.REQUEST_PIN, payload: { device } })
  })

  it('emits a needPhrase event when a passphrase is requested and entry on the device is not supported', (done) => {
    const device = { type: 'acquired', id: 'someid1234' }
    const payload = { device, features: { capabilities: [] } }

    TrezorBridge.once('trezor:needPhrase', (receivedDevice: typeof device) => {
      try {
        expect(receivedDevice).toEqual(device)
        done()
      } catch (e) {
        done(e)
      }
    })
    TrezorConnectMock.emit(UI_EVENT, { type: UI.REQUEST_PASSPHRASE, payload })
  })
})

describe('requests', () => {
  it('loads features for a given device', async () => {
    const features = { vendor: 'trezor.io', device_id: 'G89EDFE91829DACC6B43' }

    TrezorConnectMock.getFeatures.mockImplementation(async (params: CommonParams) => {
      expect(String(params.device?.path)).toBe('41')
      return { id: 1, success: true, payload: features }
    })

    const loadedFeatures = await TrezorBridge.getFeatures({ device: { path: '41' } } as CommonParams)

    expect(loadedFeatures as unknown).toEqual(features)
  })

  it('gets the public key for a given device', async () => {
    const key = { chainCode: 'eth', fingerprint: 19912902490 }

    TrezorConnectMock.getPublicKey.mockImplementation(async (params: PublicKeyParams) => {
      expect(params.device.path).toBe('4')
      expect(params.path).toBe("m/44'/60'/0/1/0")
      return { id: 1, success: true, payload: key }
    })

    const publicKey = await TrezorBridge.getPublicKey({ path: '4' } as Device, "m/44'/60'/0/1/0")

    expect(publicKey as unknown).toEqual(key)
  })

  it('gets the signature after signing a transaction', async () => {
    const tx = {
      to: null,
      value: '0x1929',
      gasLimit: '0x5208',
      nonce: '0x0',
      chainId: 4,
      maxFeePerGas: '0x1',
      maxPriorityFeePerGas: '0x1'
    }

    TrezorConnectMock.ethereumSignTransaction.mockImplementation(async (params: TransactionParams) => {
      expect(params.device.path).toBe('11')
      expect(params.path).toBe("m/44'/60'/0'/4/0")
      expect(params.transaction).toEqual(tx)
      return { id: 1, success: true, payload: { v: 1, r: 2, s: 3 } }
    })

    const signature = await TrezorBridge.signTransaction({ path: '11' } as Device, "m/44'/60'/0'/4/0", tx)

    expect(signature as unknown).toEqual({ v: 1, r: 2, s: 3 })
  })
})
