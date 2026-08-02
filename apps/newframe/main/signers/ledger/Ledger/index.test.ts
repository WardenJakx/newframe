import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest as timers,
  mock
} from 'bun:test'

import { SignTypedDataVersion } from '@metamask/eth-sig-util'
import log from 'electron-log'
import { callbackResult } from '../../callback.test-support'
import { Derivation } from '../../Signer/derive'

let ethInstance: any

const EthMock = mock(function (this: any) {
  ethInstance = {
    close: mock(async () => undefined),
    deriveAddresses: mock(),
    getAddress: mock(),
    getAppConfiguration: mock(),
    signMessage: mock(),
    signTransaction: mock(),
    signTypedData: mock()
  }
  return ethInstance
})
const TransportNodeHidMock = { open: mock(async () => ({ close: mock() })) }

mock.module('./eth.js', () => ({ default: EthMock }))
mock.module('../dependencies.js', () => ({ TransportNodeHidNoEvents: TransportNodeHidMock }))

let Ledger: any, Status: any, Eth: any, ledger: any
const addresses = ['0xf10326c1c6884b094e03d616cc8c7b920e3f73e0', '0xa16002db5438b5862270a9e404346e3c3b059eeb']
const signature =
  '0x724e7dfa6ee0fd0dd84c5d8a84eb57be29ff20ed253b3249de2e3d6b119d7b1e6a211ce0c48f93c5e399ac8cd7c6fe56e36fa960b6da92de2c435814928f2f8c1b'
const typedData = { version: SignTypedDataVersion.V4, data: 'typed data' }

const runNextRequest = () => timers.advanceTimersByTime(200)

async function runQueuedRequests(count: number) {
  for (let request = 0; request < count; request++) {
    runNextRequest()
    for (let microtask = 0; microtask < 6; microtask++) await Promise.resolve()
  }
}

function waitForEvent(event: string, predicate = () => true) {
  return new Promise<void>((resolve) => {
    const listener = () => {
      if (predicate()) {
        ledger.off(event, listener)
        resolve()
      }
    }
    ledger.on(event, listener)
  })
}

function queuedResult<T>(start: (done: Callback<T>) => void) {
  const result = callbackResult<T>(start)
  runNextRequest()
  return result
}

async function connectEthApp() {
  ethInstance.getAppConfiguration.mockResolvedValue({ version: '2.0.1' })
  const connected = waitForEvent('update', () => ledger.status === Status.OK)
  await ledger.connect()
  runNextRequest()
  await connected
}

beforeAll(async () => {
  timers.useFakeTimers()
  log.transports.console.level = false
  const ledgerModule = await import('./index')
  Ledger = ledgerModule.default
  Status = ledgerModule.Status
  Eth = (await import('./eth')).default
})

beforeEach(async () => {
  ;(Eth as any).mockClear()
  ledger = new Ledger('usb-path')
  ledger.derivation = Derivation.legacy
  await ledger.open()
  ethInstance.deriveAddresses.mockResolvedValue(addresses)
})

afterEach(async () => {
  ledger.removeAllListeners()
  await ledger.disconnect()
})

afterAll(() => {
  timers.useRealTimers()
  log.transports.console.level = 'debug'
})

describe('#connect', () => {
  it('sets the app version', async () => {
    ethInstance.getAppConfiguration.mockResolvedValue({ version: '1.9.2' })
    await ledger.connect()
    expect(ledger.appVersion).toEqual({ major: 1, minor: 9, patch: 2 })
  })

  it('detects that the app is locked', async () => {
    ethInstance.getAppConfiguration.mockResolvedValue({ version: '1.9.2' })
    ethInstance.getAddress.mockRejectedValue({ statusCode: 27404 })
    const statuses: any[] = []
    ledger.on('update', () => statuses.push(ledger.status))
    const locked = waitForEvent('lock')

    await ledger.connect()
    await locked

    expect(statuses).toEqual([Status.INITIAL])
    expect(ledger.status).toBe(Status.LOCKED)
    expect(ledger.eth).toBeDefined()
  })

  it('derives addresses after connecting', async () => {
    ethInstance.getAppConfiguration.mockResolvedValue({ version: '1.9.2' })
    const statuses: any[] = []
    ledger.on('update', () => statuses.push(ledger.status))
    const connected = waitForEvent('update', () => ledger.status === Status.OK)

    await ledger.connect()
    runNextRequest()
    await connected

    expect(ledger.addresses).toEqual(addresses)
    expect(statuses).toEqual([Status.INITIAL, Status.DERIVING, Status.OK])
  })

  for (const code of [27904, 27906, 25873, 25871]) {
    it(`sets the status to wrong application and disconnects when the status code is ${code}`, async () => {
      ethInstance.getAppConfiguration.mockRejectedValue({ statusCode: code })
      await ledger.connect()
      expect(ledger.status).toBe(Status.WRONG_APP)
      expect(ledger.eth).toBeUndefined()
    })
  }
})

describe('#deriveAddress', () => {
  beforeEach(connectEthApp)

  it('derives hardware addresses with ordered status transitions', async () => {
    const statuses: any[] = []
    ledger.on('update', () => {
      statuses.push(ledger.status)
      if (ledger.status === Status.DERIVING) expect(ledger.addresses).toHaveLength(0)
    })
    const derived = waitForEvent('update', () => ledger.status === Status.OK)

    ledger.deriveAddresses()
    runNextRequest()
    await derived

    expect(statuses).toEqual([Status.DERIVING, Status.OK])
    expect(ledger.addresses).toEqual(addresses)
  })

  it('queues and derives multiple live addresses', async () => {
    ethInstance.getAddress.mockClear()
    ethInstance.getAddress
      .mockResolvedValueOnce({ address: addresses[0] })
      .mockResolvedValueOnce({ address: addresses[1] })
    ledger.accountLimit = 2
    ledger.derivation = Derivation.live
    const derived = waitForEvent('update', () => ledger.addresses.length === 2)

    ledger.deriveAddresses()
    await runQueuedRequests(2)
    await derived

    expect(ledger.addresses).toEqual(addresses)
    expect(ethInstance.getAddress).toHaveBeenCalledTimes(2)
  })
})

describe('#verifyAddress', () => {
  beforeEach(async () => {
    await connectEthApp()
    ethInstance.getAddress.mockResolvedValue({ address: addresses[0] })
  })

  it('verifies an address without changing status', async () => {
    let updates = 0
    ledger.on('update', () => updates++)
    await expect(
      queuedResult<boolean>((done) => ledger.verifyAddress(9, addresses[0], false, done))
    ).resolves.toBeTrue()
    expect({ status: ledger.status, updates }).toEqual({ status: Status.OK, updates: 0 })
  })

  const errors = [
    ['the address does not match', 'Address does not match device', () => {}],
    [
      'the verification request is rejected by the user',
      'Verify request rejected by user',
      () => ethInstance.getAddress.mockRejectedValue({ statusCode: 27013 })
    ],
    [
      'there is a communication error',
      'Verify address error',
      () => ethInstance.getAddress.mockRejectedValue({ statusCode: -1 })
    ],
    ['the eth app is not initialized', 'Verify address error', () => (ledger.eth = undefined)],
    ['the derivation type is not initialized', 'Verify address error', () => (ledger.derivation = undefined)]
  ] as const

  for (const [testCase, message, setup] of errors) {
    it(`fails if ${testCase}`, async () => {
      setup()
      await expect(
        queuedResult((done) =>
          ledger.verifyAddress(1, '0xe9d6f5779cf6936de03c0bec631f3bb3e336d98d', false, done)
        )
      ).rejects.toThrow(message)
      expect(ledger.status).toBe(Status.NEEDS_RECONNECTION)
    })
  }
})

for (const signingMethod of ['signMessage', 'signTransaction']) {
  const signType = signingMethod.substring(4).toLowerCase()

  describe(`#${signingMethod}`, () => {
    beforeEach(connectEthApp)

    it(`signs a ${signType} without changing status`, async () => {
      ethInstance[signingMethod].mockResolvedValue(signature)
      let updates = 0
      ledger.on('update', () => updates++)

      await expect(queuedResult((done) => ledger[signingMethod](3, 'hello, Frame!', done))).resolves.toBe(
        signature
      )
      expect({ status: ledger.status, updates }).toEqual({ status: Status.OK, updates: 0 })
    })

    it('keeps the signer open when the user rejects signing', async () => {
      ethInstance[signingMethod].mockRejectedValue({ statusCode: 27013 })
      let updates = 0
      let closes = 0
      ledger.on('update', () => updates++)
      ledger.on('close', () => closes++)

      await expect(queuedResult((done) => ledger[signingMethod](3, 'hello, Frame!', done))).rejects.toThrow(
        'Sign request rejected by user'
      )
      expect({ status: ledger.status, updates, closes }).toEqual({ status: Status.OK, updates: 0, closes: 0 })
    })

    for (const [testCase, setup] of [
      [
        'there is a communication error',
        () => ethInstance[signingMethod].mockRejectedValue({ statusCode: -1 })
      ],
      ['the eth app is not initialized', () => (ledger.eth = undefined)],
      ['the derivation type is not initialized', () => (ledger.derivation = undefined)]
    ] as const) {
      it(`fails if ${testCase}`, async () => {
        setup()
        await expect(queuedResult((done) => ledger[signingMethod](3, 'hello, Frame!', done))).rejects.toThrow(
          `Sign ${signType} error`
        )
        expect(ledger.status).toBe(Status.NEEDS_RECONNECTION)
      })
    }
  })
}

describe('#signTypedData', () => {
  beforeEach(connectEthApp)

  it('signs v4 typed data without changing status', async () => {
    ethInstance.signTypedData.mockResolvedValue(signature)
    let updates = 0
    ledger.on('update', () => updates++)

    await expect(queuedResult((done) => ledger.signTypedData(5, typedData, done))).resolves.toBe(signature)
    expect({ status: ledger.status, updates }).toEqual({ status: Status.OK, updates: 0 })
  })

  for (const [testCase, setup, message, expectedStatus] of [
    [
      'the user rejects signing',
      () => ethInstance.signTypedData.mockRejectedValue({ statusCode: 27013 }),
      'Sign request rejected by user',
      'OK'
    ],
    [
      'the signing request is invalid',
      () => ethInstance.signTypedData.mockRejectedValue({ statusCode: 99901, message: 'Invalid typed data' }),
      'Sign message error',
      'OK'
    ],
    [
      'there is a communication error',
      () => ethInstance.signTypedData.mockRejectedValue({ statusCode: -1 }),
      'Sign message error',
      'NEEDS_RECONNECTION'
    ],
    [
      'the eth app is not initialized',
      () => (ledger.eth = undefined),
      'Sign message error',
      'NEEDS_RECONNECTION'
    ],
    [
      'the derivation type is not initialized',
      () => (ledger.derivation = undefined),
      'Sign message error',
      'NEEDS_RECONNECTION'
    ]
  ] as const) {
    it(`fails if ${testCase}`, async () => {
      setup()
      await expect(queuedResult((done) => ledger.signTypedData(5, typedData, done))).rejects.toThrow(message)
      expect(ledger.status).toBe(Status[expectedStatus])
    })
  }
})
