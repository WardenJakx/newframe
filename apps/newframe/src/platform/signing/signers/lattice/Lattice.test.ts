import { afterAll, beforeAll, beforeEach, describe, expect, it, jest as timers, mock } from 'bun:test'
import type { Mock } from 'bun:test'

import { SignTypedDataVersion } from '@metamask/eth-sig-util'
import log from 'electron-log'

import type { TypedMessage } from '../../../../features/requests/contract/requests.ts'
import { GasFeesSource } from '../../../../features/transactions/domain/index.ts'
import { callbackResult } from '../callback.test-support.ts'
import { Derivation } from '../Signer/derive'

type LatticeConstructor = typeof import('./Lattice').default
type ProductionLattice = InstanceType<LatticeConstructor>
type ClientConstructor = typeof import('gridplus-sdk').Client
type ClientInstance = InstanceType<ClientConstructor>
type LatticeSignOptions = {
  currency: string
  data: {
    chainId?: string
    protocol?: string
    signerPath: number[]
    type?: number
  }
}
type LatticeSignResult = { sig: { r: string; s: string; v: bigint } }
type ClientFake = {
  connect?: (deviceId: string) => Promise<boolean>
  getAddresses?: ClientInstance['getAddresses']
  getAppName?: () => string
  getFwVersion?: () =>
    | { major: number; minor: number; fix: number }
    | Promise<{ major: number; minor: number; fix: number }>
  pair?: (pairingCode: string) => Promise<boolean>
  sign?: (options: LatticeSignOptions) => Promise<LatticeSignResult>
}
type LatticeInstance = Pick<
  ProductionLattice,
  | 'accountLimit'
  | 'addresses'
  | 'appVersion'
  | 'close'
  | 'connect'
  | 'deriveAddresses'
  | 'derivation'
  | 'disconnect'
  | 'listenerCount'
  | 'on'
  | 'pair'
  | 'signMessage'
  | 'signTransaction'
  | 'signTypedData'
  | 'status'
  | 'summary'
  | 'verifyAddress'
> & { connection: ClientFake | string | null }

const ClientMock = mock(function (_options: ConstructorParameters<ClientConstructor>[0]): ClientFake {
  return {}
})
const gridplusConstantsMock = {
  SIGNING: {
    CURVES: { SECP256K1: 'secp256k1' },
    HASHES: { KECCAK256: 'keccak256' },
    ENCODINGS: { EVM: 'evm' }
  }
}

await mock.module('gridplus-sdk', () => ({
  Client: ClientMock,
  Constants: gridplusConstantsMock,
  Utils: { fetchCalldataDecoder: mock() }
}))

let lattice: LatticeInstance
let Lattice: LatticeConstructor

beforeAll(async () => {
  log.transports.console.level = false
  timers.useFakeTimers()
  Lattice = (await import('./Lattice')).default
})

afterAll(() => {
  log.transports.console.level = 'debug'
  timers.useRealTimers()
})

beforeEach(() => {
  lattice = new Lattice('L8geF2', 'Gridplus-test', 'ABCXYZ') as LatticeInstance
  lattice.derivation = Derivation.standard
  lattice.on('error', mock())
})

describe('#connect', () => {
  const baseUrl = 'https://gridplus.io'
  const privateKey = 'supersecretkey'
  let connect: Mock<(deviceId: string) => Promise<boolean>>

  beforeEach(() => {
    connect = mock<(deviceId: string) => Promise<boolean>>(async (deviceId) => {
      if (deviceId === 'L8geF2') {
        return false
      }
      throw new Error('connection error!')
    })
    ClientMock.mockImplementation((options) => {
      expect(options).toMatchObject({ name: 'Newframe-ABCXYZ', baseUrl, privKey: privateKey })
      return {
        connect,
        getFwVersion: () => ({ major: 0, minor: 13, fix: 4 }),
        getAppName: () => 'frame-test'
      }
    })
  })

  it('publishes the complete unpaired and paired connection lifecycle', async () => {
    const statuses: string[] = []
    const connected: boolean[] = []
    lattice.on('update', () => statuses.push(lattice.status))
    lattice.on('connect', (paired: boolean) => connected.push(paired))

    expect(await lattice.connect(baseUrl, privateKey)).toBeFalse()
    expect(statuses).toEqual(['connecting', 'pair'])
    expect(connected.at(-1)).toBeFalse()
    expect(lattice.appVersion).toEqual({ major: 0, minor: 13, patch: 4 })

    connect.mockResolvedValue(true)
    expect(await lattice.connect(baseUrl, privateKey)).toBeTrue()
    expect(connected.at(-1)).toBeTrue()
  })

  it('maps locked and invalid device failures without publishing a connection', async () => {
    const connected: boolean[] = []
    lattice.on('connect', (paired: boolean) => connected.push(paired))
    for (const [message, status] of [
      ['Error from device: Device Locked', 'locked'],
      ['Error from device: Invalid Request', 'unknown device error']
    ]) {
      connect.mockRejectedValueOnce(new Error(message))
      expect(lattice.connect(baseUrl, privateKey)).rejects.toThrow(message.split(': ')[1])
      expect(lattice.status.toLowerCase()).toContain(status)
    }
    expect(connected).toEqual([])
  })
})

describe('#pair', () => {
  const pairingCode = 'JG7F9XS3'
  let pair: Mock<(pairingCode: string) => Promise<boolean>>

  beforeEach(() => {
    pair = mock<(pairingCode: string) => Promise<boolean>>(async (code) => {
      if (code === pairingCode) {
        return true
      }
      throw new Error('Error from device: Pairing failed')
    })
    lattice.connection = {
      pair
    }
  })

  it('publishes pairing state and the active-wallet result', async () => {
    const statuses: string[] = []
    const paired: boolean[] = []
    lattice.on('update', () => statuses.push(lattice.status))
    lattice.on('paired', (active: boolean) => paired.push(active))

    expect(await lattice.pair(pairingCode)).toBeTrue()
    expect(statuses).toEqual(['Pairing'])
    expect(paired.at(-1)).toBeTrue()

    pair.mockResolvedValue(false)
    expect(await lattice.pair(pairingCode)).toBeFalse()
    expect(paired.at(-1)).toBeFalse()
  })

  it('publishes pairing failures without a paired event', async () => {
    const paired: boolean[] = []
    lattice.on('paired', (active: boolean) => paired.push(active))
    expect(lattice.pair('SDFJOSJD')).rejects.toThrow('Pairing failed')
    expect(lattice.status.toLowerCase()).toBe('pairing failed')
    expect(paired).toEqual([])
  })
})

describe('#deriveAddresses', () => {
  let getAddresses: Mock<ClientInstance['getAddresses']>

  beforeEach(() => {
    lattice.accountLimit = 5
    getAddresses = mock<ClientInstance['getAddresses']>(async (options) =>
      Array.from({ length: options.n }, (_, index) => `addr${options.startPath.at(-1)! + index}`)
    )
    lattice.connection = {
      getAppName: () => 'frame-test',
      getAddresses
    }
  })

  it('uses the standard, legacy, and Live derivation paths', async () => {
    await lattice.deriveAddresses(Derivation.standard)
    expect(getAddresses).toHaveBeenLastCalledWith(
      expect.objectContaining({ startPath: [0x8000002c, 0x8000003c, 0x80000000, 0, 0] })
    )

    lattice.addresses = ['addr1', 'addr2', 'addr3', 'addr4', 'addr5']
    lattice.accountLimit = 10
    await lattice.deriveAddresses(Derivation.legacy)
    expect(getAddresses).toHaveBeenLastCalledWith(
      expect.objectContaining({ startPath: [0x8000002c, 0x8000003c, 0x80000000, 5] })
    )

    lattice.addresses = []
    lattice.accountLimit = 5
    getAddresses.mockClear()
    await lattice.deriveAddresses(Derivation.live)
    expect(getAddresses).toHaveBeenCalledTimes(5)
    for (let index = 0; index < 5; index++) {
      expect(getAddresses).toHaveBeenNthCalledWith(
        index + 1,
        expect.objectContaining({
          startPath: [0x8000002c, 0x8000003c, 0x80000000 + index, 0, 0]
        })
      )
    }
  })

  it('publishes status, appends to the limit, and skips a satisfied limit', async () => {
    const statuses: string[] = []
    lattice.on('update', () => statuses.push(lattice.status))
    await lattice.deriveAddresses()
    expect(statuses).toEqual(['addresses', 'ok'])
    expect(lattice.addresses).toEqual(['0xaddr0', '0xaddr1', '0xaddr2', '0xaddr3', '0xaddr4'])

    lattice.addresses = Array.from({ length: 5 }, (_, index) => `addr${index}`)
    lattice.accountLimit = 10
    await lattice.deriveAddresses()
    expect(lattice.addresses).toEqual(Array.from({ length: 10 }, (_, index) => `0xaddr${index}`))

    getAddresses.mockClear()
    lattice.accountLimit = 5
    await lattice.deriveAddresses()
    expect(getAddresses).not.toHaveBeenCalled()
    expect(lattice.addresses).toHaveLength(10)
  })

  it('retries once and eventually publishes the derived addresses', async () => {
    let requests = 0
    let errors = 0
    lattice.on('error', () => errors++)
    getAddresses.mockImplementation(async () => {
      if (++requests === 1) {
        throw new Error('Error from device: Getting addresses failed')
      }
      return ['addr1', 'addr2', 'addr3', 'addr4', 'addr5']
    })
    const deriving = lattice.deriveAddresses()
    await Promise.resolve()
    await Promise.resolve()
    timers.advanceTimersByTime(3_000)
    await deriving
    expect(errors).toBe(0)
    expect(lattice.addresses).toHaveLength(5)
    expect(lattice.status).toBe('ok')
  })

  it('publishes a terminal error after retries are exhausted', async () => {
    getAddresses.mockRejectedValue(new Error('Error from device: Getting addresses failed'))
    let errors = 0
    lattice.on('error', () => errors++)
    await lattice.deriveAddresses(Derivation.standard, 0)
    expect(errors).toBe(1)
    expect(lattice.addresses).toHaveLength(0)
    expect(lattice.status.toLowerCase()).toContain('error')
  })
})

describe('signing and verification', () => {
  it('verifies matches and rejects mismatches or derivation failures', async () => {
    const getAddresses = mock<ClientInstance['getAddresses']>()
    lattice.addresses = ['addr1', 'addr2', 'addr3', 'addr4', 'addr5']
    lattice.accountLimit = 5
    lattice.connection = { getAddresses, getAppName: () => 'frame-test' }
    expect(
      await callbackResult<boolean>((done) => void lattice.verifyAddress(2, 'addr3', false, done))
    ).toBeTrue()
    expect(callbackResult((done) => void lattice.verifyAddress(2, 'addrX', false, done))).rejects.toThrow(
      'Address does not match device'
    )

    lattice.addresses = []
    getAddresses.mockRejectedValue(new Error('error!'))
    expect(callbackResult((done) => void lattice.verifyAddress(2, 'addr3', false, done))).rejects.toThrow(
      'Verify Address Error'
    )
  })

  it('signs personal and typed messages and rejects the wrong path', async () => {
    lattice.connection = {
      sign: mock<(options: LatticeSignOptions) => Promise<LatticeSignResult>>(async (options) => {
        const expectedIndex = options.data.protocol === 'eip712' ? 2 : 4
        if (options.currency !== 'ETH_MSG' || options.data.signerPath[4] !== expectedIndex) {
          throw new Error('invalid message!')
        }
        return {
          sig: {
            r: options.data.protocol === 'eip712' ? '0x3ea8cd' : '0x9af6cb',
            s: '0xabcd04',
            v: 1n
          }
        }
      })
    }
    expect(
      await callbackResult<string>((done) => void lattice.signMessage(4, 'sign this please', done))
    ).toBe('0x9af6cbabcd0401')
    expect(
      callbackResult((done) => void lattice.signMessage(3, 'sign this please', done))
    ).rejects.toBeTruthy()

    const typed: TypedMessage<SignTypedDataVersion.V4> = {
      version: SignTypedDataVersion.V4,
      data: { types: { EIP712Domain: [] }, primaryType: 'EIP712Domain', domain: {}, message: {} }
    }
    expect(await callbackResult<string>((done) => void lattice.signTypedData(2, typed, done))).toBe(
      '0x3ea8cdabcd0401'
    )
    expect(callbackResult((done) => void lattice.signTypedData(3, typed, done))).rejects.toBeTruthy()
  })

  it('signs legacy and EIP-1559 transactions with their exact wire shapes', async () => {
    const wireTypes: unknown[] = []
    lattice.appVersion = { major: 1, minor: 1, patch: 0 }
    lattice.connection = {
      getFwVersion: async () => ({ major: 1, minor: 3, fix: 5 }),
      sign: mock<(options: LatticeSignOptions) => Promise<LatticeSignResult>>(async (options) => {
        wireTypes.push(options.data.type)
        expect(options.currency).toBe('ETH')
        expect(options.data.signerPath[4]).toBe(4)
        if (!options.data.chainId) {
          throw new Error('missing chain id')
        }
        expect(parseInt(options.data.chainId)).toBe(137)
        return { sig: { r: '0x3ea8cd', s: '0x96f7a0', v: options.data.type === undefined ? 27n : 0n } }
      })
    }
    for (const [type, expected, wireType] of [
      ['0x0', '0xcf8080808080801b833ea8cd8396f7a0', undefined],
      ['0x2', '0x02d3818980808080808080c080833ea8cd8396f7a0', 2]
    ] as const) {
      expect(
        await callbackResult<string>(
          (done) =>
            void lattice.signTransaction(
              4,
              { chainId: '0x89', type, gasFeesSource: GasFeesSource.Dapp },
              done
            )
        )
      ).toBe(expected)
      expect(wireTypes.at(-1)).toBe(wireType)
    }
  })
})

it('disconnects without overwriting errors and clears connection-owned state', () => {
  let updates = 0
  lattice.status = 'ok'
  lattice.connection = 'a connection'
  lattice.addresses = ['addr1']
  lattice.on('update', () => updates++)
  lattice.disconnect()
  expect(lattice.status).toBe('disconnected')
  expect(updates).toBe(1)
  expect(lattice.connection).toBeFalsy()
  expect(lattice.addresses).toEqual([])

  lattice.status = 'some error'
  lattice.disconnect()
  expect(lattice.status).toBe('some error')
  expect(updates).toBe(1)
})

it('closes by publishing once, removing listeners, and disconnecting', () => {
  let closes = 0
  lattice.connection = 'a connection'
  lattice.on('close', () => closes++)
  lattice.close()
  expect(closes).toBe(1)
  expect(lattice.listenerCount('close')).toBe(0)
  expect(lattice.connection).toBeFalsy()
})

it('limits published summary addresses to the configured account limit', () => {
  lattice.addresses = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']
  lattice.accountLimit = 5
  expect(lattice.summary().addresses).toHaveLength(5)
})
