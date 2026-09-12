import { describe, expect, it } from 'bun:test'
import { UR, URDecoder, UREncoder } from '@ngraveio/bc-ur'
import { ETHSignature, EthSignRequest } from '@keystonehq/bc-ur-registry-eth'
import { createUnsignedTransaction, sign } from '../../../../features/transactions/main/index.js'
import {
  AirGapUrAssembler,
  airGapId,
  chainNumber,
  DataType,
  decodePublicAccount,
  decodeSignature,
  deriveAirGapAddresses,
  requestFrames,
  transactionPreimage
} from './protocol.js'
import { publicAccount, transaction, vectors } from '../../../../../test/integration/fixtures/airgap.js'

function assemble(frames: string[], type: 'crypto-hdkey' | 'eth-signature') {
  const assembler = new AirGapUrAssembler(type)
  let result: Buffer | undefined
  for (const frame of frames) result = assembler.receive(frame) ?? result
  return result!
}
const single = (hex: string, type = 'crypto-hdkey') =>
  UREncoder.encodeSinglePart(new UR(Buffer.from(hex, 'hex'), type))
const sessionId = '00000000-0000-4000-8000-000000000001'

it('restores the observed public export, stable identity and standard children', () => {
  const decoder = new AirGapUrAssembler('crypto-hdkey')
  expect(decoder.receive(vectors.export.ur[1].toUpperCase())).toBeUndefined()
  expect(decoder.receive(vectors.export.ur[1])).toBeUndefined()
  expect(() => decoder.receive(single('a0', 'eth-signature'))).toThrow('crypto-hdkey')
  const account = decodePublicAccount(decoder.receive(vectors.export.ur[0])!)
  expect(account.originPath).toBe(vectors.export.basePath)
  expect(account.sourceFingerprint).toBe(vectors.export.sourceFingerprint)
  const addresses = deriveAirGapAddresses(account)
  expect(addresses).toHaveLength(100)
  expect(addresses[0]).toBe(vectors.export.address)
  expect(airGapId(account)).toBe(airGapId({ ...account, name: 'Renamed' }))
})

for (const vector of vectors.transactions)
  it(`verifies source-derived type ${vector.type} chain ${vector.chainId} with full v`, async () => {
    const rawTx = transaction(vector)
    const tx = createUnsignedTransaction(rawTx)
    expect(transactionPreimage(tx).toString('hex')).toBe(vector.signData)
    const kind = vector.type === 0 ? DataType.transaction : DataType.typedTransaction
    const cbor = assemble(vector.responseFrames, 'eth-signature')
    const signature = decodeSignature(cbor, sessionId, kind, vector.chainId)
    const signed = await sign(rawTx, async () => signature)
    expect(Buffer.from(signed.serialize()).toString('hex')).toBe(vector.signedHex)
    expect(String(signed.getSenderAddress())).toBe(vectors.export.address.toLowerCase())
    if (vector.chainId === 137)
      expect(() => decodeSignature(cbor, sessionId, kind, vector.chainId + 1)).toThrow()
  })

it('encodes a fixed UUID, full derivation, source fingerprint and finite bounded frames', () => {
  const record = publicAccount()
  const frames = requestFrames(
    record,
    3,
    sessionId,
    137,
    DataType.personalMessage,
    Buffer.from([0, 255, 128, 195]),
    vectors.export.address
  )
  const decoder = new URDecoder()
  frames.forEach((frame) => decoder.receivePart(frame))
  const request = EthSignRequest.fromCBOR(decoder.resultUR().cbor)
  expect(request.getRequestId()?.toString('hex')).toBe(sessionId.replaceAll('-', ''))
  expect(request.getDerivationPath()).toBe("44'/60'/0'/0/3")
  expect(request.getSourceFingerprint().toString('hex')).toBe(record.sourceFingerprint)
  expect(request.getSignData()).toEqual(Buffer.from([0, 255, 128, 195]))
  expect(request.getChainId()).toBe(137)
  for (const invalid of [0, -1, Number.MAX_SAFE_INTEGER + 1]) expect(() => chainNumber(invalid)).toThrow()
})

const hostile = [
  '1b000000',
  '1b0020000000000000',
  '5b0000000100000000',
  '7b0000000100000000',
  '9affffffff',
  'baffffffff',
  'a101',
  'a201f401f4',
  'a10b01',
  'bf',
  'fa00000000',
  'd9012f00',
  'a201f5035821' + '02'.repeat(33),
  '81'.repeat(18) + '00',
  '990fff' + '00'.repeat(4095)
]
describe('hostile declarations before registry or fountain allocation', () => {
  for (const hex of hostile)
    it(`rejects ${hex.slice(0, 36)}`, () => {
      expect(() => new AirGapUrAssembler('crypto-hdkey').receive(single(hex))).toThrow()
    })
  it('rejects sequence coercions and mismatched or oversized fountain declarations', () => {
    const frame = vectors.export.ur[0]
    for (const sequence of ['01-2', '1-02', '0-2', '4294967296-2', '1-513', '1-2-3']) {
      expect(() =>
        new AirGapUrAssembler('crypto-hdkey').receive(frame.replace('/1-2/', `/${sequence}/`))
      ).toThrow()
    }
    // Raw CBOR [sequence,count,length,checksum,fragment]. Small payloads, hostile counts.
    for (const hex of [
      '85020303014100',
      '85010203014100',
      '850119020119ffff014100',
      '85010201014100',
      '850102190101014100'
    ]) {
      const body = single(hex).split('/')[1]
      expect(() => new AirGapUrAssembler('crypto-hdkey').receive(`ur:crypto-hdkey/1-2/${body}`)).toThrow()
    }
    expect(() => new AirGapUrAssembler('crypto-hdkey').receive(frame + '/extra')).toThrow()
    expect(() => new AirGapUrAssembler('crypto-hdkey').receive('x'.repeat(4097))).toThrow()
  })
})

it('rejects invalid scalars and over-wide or invalid v without accepting a missing UUID', () => {
  const uuid = Buffer.from(sessionId.replaceAll('-', ''), 'hex')
  for (const signature of [
    Buffer.alloc(65),
    Buffer.concat([Buffer.alloc(32, 255), Buffer.alloc(32, 1), Buffer.from([27])]),
    Buffer.concat([Buffer.alloc(32, 1), Buffer.alloc(32, 255), Buffer.from([27])]),
    Buffer.from(vectors.messages[0].signature.slice(0, 128) + '02', 'hex'),
    Buffer.from(vectors.messages[0].signature.slice(0, 128) + '001b', 'hex')
  ]) {
    const cbor = new ETHSignature(signature, uuid).toCBOR()
    expect(() => decodeSignature(cbor, sessionId, DataType.personalMessage, 1)).toThrow()
  }
  expect(() =>
    decodeSignature(new ETHSignature(Buffer.alloc(65, 1)).toCBOR(), sessionId, DataType.personalMessage, 1)
  ).toThrow()
})

function scalar(value: number, width = 0, major = 0) {
  if (!width && value < 24) return Buffer.from([(major << 5) | value])
  const actual = width || (value <= 255 ? 1 : value <= 65535 ? 2 : 4)
  const buffer = Buffer.alloc(actual + 1)
  buffer[0] = (major << 5) | { 1: 24, 2: 25, 4: 26, 8: 27 }[actual]!
  let remaining = BigInt(value)
  for (let i = actual; i > 0; i--) {
    buffer[i] = Number(remaining & 255n)
    remaining >>= 8n
  }
  return buffer
}
function fountainFrame(count: number, length: number, fragmentLength: number, widths: number[]) {
  const cbor = Buffer.concat([
    scalar(5, widths[0], 4),
    scalar(1, widths[1]),
    scalar(count, widths[2]),
    scalar(length, widths[3]),
    scalar(0, widths[4]),
    scalar(fragmentLength, widths[5], 2),
    Buffer.alloc(fragmentLength)
  ])
  return `ur:crypto-hdkey/1-${count}/${UREncoder.encodeSinglePart(new UR(cbor, 'crypto-hdkey')).split('/')[1]}`
}
it('bounds padded fountain size before decoder construction', () => {
  expect(() =>
    new AirGapUrAssembler('crypto-hdkey').receive(fountainFrame(512, 65536, 129, [0, 0, 2, 4, 0, 1]))
  ).toThrow()
})
for (const [name, count, length, fragmentLength] of [
  ['distinct frames', 512, 65536, 128],
  ['cumulative bytes', 32, 57600, 1800]
] as const)
  it(`resets a retryable attempt after exhausting ${name}`, () => {
    const decoder = new AirGapUrAssembler('crypto-hdkey')
    let exhausted = false
    let accepted = 0
    outer: for (const root of [0, 1, 2, 4, 8])
      for (const sequence of [0, 1, 2, 4, 8])
        for (const countWidth of [2, 4, 8])
          for (const lengthWidth of [4, 8])
            for (const checksum of [0, 1, 2, 4, 8])
              for (const fragmentWidth of [2, 4, 8]) {
                try {
                  decoder.receive(
                    fountainFrame(count, length, fragmentLength, [
                      root,
                      sequence,
                      countWidth,
                      lengthWidth,
                      checksum,
                      fragmentWidth
                    ])
                  )
                  accepted++
                } catch (error) {
                  expect((error as Error).message).toContain('limit reached')
                  exhausted = true
                  break outer
                }
              }
    expect(exhausted).toBe(true)
    expect(accepted).toBe(name === 'distinct frames' ? 1024 : Math.floor(1_048_576 / fragmentLength))
    expect(decoder.receive(vectors.export.ur[0])).toBeUndefined()
    expect(decodePublicAccount(decoder.receive(vectors.export.ur[1])!).sourceFingerprint).toBe(
      vectors.export.sourceFingerprint
    )
  })

it('rejects an outbound near-limit request whose padded fragments exceed 64 KiB', () => {
  expect(() =>
    requestFrames(
      publicAccount(),
      0,
      sessionId,
      1,
      DataType.personalMessage,
      Buffer.alloc(65_440),
      vectors.export.address
    )
  ).toThrow('too large')
})
