import { createHash } from 'node:crypto'

import { RLP } from '@ethereumjs/rlp'
import type { TypedTransaction } from '@ethereumjs/tx'
import { CryptoHDKey, CryptoKeypath, PathComponent } from '@keystonehq/bc-ur-registry'
import { DataType, EthSignRequest, ETHSignature } from '@keystonehq/bc-ur-registry-eth'
import { URDecoder, UREncoder } from '@ngraveio/bc-ur'
import { HDKey } from '@scure/bip32'

import { AirGapPublicAccountSchema, type AirGapPublicAccount } from '../../domain/airgap.js'
import { deriveHDAccounts } from '../Signer/derive.js'

export { DataType }
const MAX_MESSAGE = 65_536
const UINT32 = 0xffffffff
const invalid = () => new Error('Invalid AirGap QR. Scan the supported export again.')

// Only this bounded walk may inspect CBOR before the upstream registry/fountain decoder.
// Containers grow with visited input, never with attacker-declared lengths.
type Value =
  | number
  | boolean
  | null
  | Buffer
  | string
  | Value[]
  | Map<number, Value>
  | { tag: number; value: Value }
function inspectCbor(bytes: Buffer): Value {
  if (!bytes.length || bytes.length > MAX_MESSAGE) {
    throw invalid()
  }
  let cursor = 0
  let items = 0
  const walk = (depth: number): Value => {
    if (depth > 16 || ++items > 4096 || cursor >= bytes.length) {
      throw invalid()
    }
    const head = bytes[cursor++]
    const major = head >> 5
    const info = head & 31
    if (major === 7) {
      if (info === 20 || info === 21) {
        return info === 21
      }
      if (info === 22) {
        return null
      }
      throw invalid()
    }
    if (info >= 28) {
      throw invalid()
    }
    let size = info
    if (info >= 24) {
      const width = 2 ** (info - 24)
      if (width > bytes.length - cursor) {
        throw invalid()
      }
      let value = 0n
      for (let i = 0; i < width; i++) {
        value = (value << 8n) | BigInt(bytes[cursor++])
      }
      if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
        throw invalid()
      }
      size = Number(value)
    }
    if (major === 0) {
      return size
    }
    if (major === 1) {
      if (!Number.isSafeInteger(-1 - size)) {
        throw invalid()
      }
      return -1 - size
    }
    if (major === 2 || major === 3) {
      if (size > bytes.length - cursor) {
        throw invalid()
      }
      const value = bytes.subarray(cursor, cursor + size)
      cursor += size
      return major === 2 ? value : new TextDecoder('utf-8', { fatal: true }).decode(value)
    }
    if (major === 4) {
      if (size > 4096 - items || size > bytes.length - cursor) {
        throw invalid()
      }
      const values: Value[] = []
      for (let i = 0; i < size; i++) {
        values.push(walk(depth + 1))
      }
      return values
    }
    if (major === 5) {
      if (size > Math.floor((4096 - items) / 2) || size > Math.floor((bytes.length - cursor) / 2)) {
        throw invalid()
      }
      const map = new Map<number, Value>()
      for (let i = 0; i < size; i++) {
        const key = walk(depth + 1)
        if (typeof key !== 'number' || !Number.isInteger(key) || key < 1 || key > 10 || map.has(key)) {
          throw invalid()
        }
        map.set(key, walk(depth + 1))
      }
      return map
    }
    if (major === 6 && [37, 304, 305].includes(size)) {
      return { tag: size, value: walk(depth + 1) }
    }
    throw invalid()
  }
  const result = walk(0)
  if (cursor !== bytes.length) {
    throw invalid()
  }
  return result
}
function map(value: Value | undefined, keys: number[]): Map<number, Value> {
  if (!(value instanceof Map) || [...value.keys()].some((key) => !keys.includes(key))) {
    throw invalid()
  }
  return value
}
function tagged(value: Value | undefined, tag: number): Value {
  if (!value || typeof value !== 'object' || !('tag' in value) || value.tag !== tag) {
    throw invalid()
  }
  return value.value
}
function uint(value: Value | undefined, max = UINT32): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > max) {
    throw invalid()
  }
  return value
}
function byteString(value: Value | undefined, min: number, max = min): Buffer {
  if (!Buffer.isBuffer(value) || value.length < min || value.length > max) {
    throw invalid()
  }
  return value
}
function keypath(value: Value | undefined, origin: boolean) {
  const path = map(tagged(value, 304), [1, 2, 3])
  const components = path.get(1)
  if (!Array.isArray(components) || components.length !== (origin ? 6 : 4)) {
    throw invalid()
  }
  for (let i = 0; i < components.length; i += 2) {
    uint(components[i], 0x7fffffff)
    if (components[i + 1] !== origin) {
      throw invalid()
    }
  }
  if (origin && (components[0] !== 44 || components[2] !== 60)) {
    throw invalid()
  }
  if (!origin && (components[0] !== 0 || components[2] !== 0)) {
    throw invalid()
  }
  if (origin || path.has(2)) {
    uint(path.get(2))
  }
  if (path.has(3) && uint(path.get(3)) !== (origin ? 3 : 2)) {
    throw invalid()
  }
}
function inspectProfile(cbor: Buffer, type: 'crypto-hdkey' | 'eth-signature') {
  const record = map(inspectCbor(cbor), type === 'crypto-hdkey' ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] : [1, 2, 3])
  if (type === 'eth-signature') {
    byteString(tagged(record.get(1), 37), 16)
    byteString(record.get(2), 65, 72)
    if (record.has(3) && typeof record.get(3) !== 'string') {
      throw invalid()
    }
    return record
  }
  for (const field of [1, 2]) {
    if (record.has(field) && record.get(field) !== false) throw invalid()
  }
  byteString(record.get(3), 33)
  byteString(record.get(4), 32)
  keypath(record.get(6), true)
  if (record.has(7)) {
    keypath(record.get(7), false)
  }
  if (record.has(5)) {
    const info = map(tagged(record.get(5), 305), [1, 2])
    if (uint(info.get(1) ?? 0) !== 60 || uint(info.get(2) ?? 0) !== 0) {
      throw invalid()
    }
  }
  if (record.has(8)) {
    uint(record.get(8))
  }
  for (const key of [9, 10]) {
    if (record.has(key) && typeof record.get(key) !== 'string') throw invalid()
  }
  return record
}

export class AirGapUrAssembler {
  private decoder = new URDecoder()
  private frames = new Set<string>()
  private bytesReceived = 0
  private message?: string
  constructor(private readonly type: 'crypto-hdkey' | 'eth-signature') {}
  reset() {
    this.decoder = new URDecoder()
    this.frames.clear()
    this.bytesReceived = 0
    this.message = undefined
  }
  get progress() {
    return Math.max(0, Math.min(1, this.decoder.estimatedPercentComplete()))
  }
  receive(frame: string): Buffer | undefined {
    if (typeof frame !== 'string' || frame.length > 4096 || !/^[\x21-\x7e]+$/.test(frame)) {
      throw invalid()
    }
    const [type, components] = URDecoder.parse(frame)
    if (type !== this.type) {
      throw new Error(`Scan a ${this.type} QR.`)
    }
    if (components.length !== 1 && components.length !== 2) {
      throw invalid()
    }
    const canonical = frame.toLowerCase()
    const body = components.at(-1)!
    if (!/^(?:[a-z]{2})+$/.test(body)) {
      throw invalid()
    }
    // Static decode interprets Bytewords only. It must receive the extracted body.
    const cbor = URDecoder.decode(`ur:${type}/${body}`).cbor
    let fragmentLength = cbor.length
    let identity: string | undefined
    if (components.length === 2) {
      if (!/^[1-9]\d{0,9}-[1-9]\d{0,2}$/.test(components[0])) {
        throw invalid()
      }
      const [outerSequence, outerCount] = components[0].split('-').map(Number)
      if (outerSequence > UINT32 || outerCount > 512) {
        throw invalid()
      }
      const part = inspectCbor(cbor)
      if (!Array.isArray(part) || part.length !== 5) {
        throw invalid()
      }
      const sequence = uint(part[0]),
        count = uint(part[1], 512),
        length = uint(part[2], MAX_MESSAGE),
        checksum = uint(part[3])
      const fragment = byteString(part[4], 1, MAX_MESSAGE)
      if (
        sequence < 1 ||
        count < 1 ||
        length < 1 ||
        sequence !== outerSequence ||
        count !== outerCount ||
        count * fragment.length > MAX_MESSAGE ||
        (count - 1) * fragment.length >= length ||
        length > count * fragment.length
      ) {
        throw invalid()
      }
      fragmentLength = fragment.length
      identity = `${count}:${length}:${checksum}:${fragmentLength}`
      if (this.message && this.message !== identity) {
        throw new Error('Different QR sequence. Finish this scan or restart it.')
      }
    } else {
      inspectProfile(cbor, this.type)
    }
    if (this.frames.has(canonical)) {
      return
    }
    if (this.frames.size >= 1024 || this.bytesReceived + fragmentLength > 1_048_576) {
      this.reset()
      throw new Error('QR scan limit reached. Start scanning the QR sequence again.')
    }
    this.frames.add(canonical)
    this.bytesReceived += fragmentLength
    if (identity) {
      this.message = identity
    }
    try {
      this.decoder.receivePart(canonical)
      if (this.decoder.isError()) {
        throw invalid()
      }
      if (!this.decoder.isSuccess()) {
        return
      }
      const result = this.decoder.resultUR().cbor
      inspectProfile(result, this.type)
      return result
    } catch {
      this.reset()
      throw invalid()
    }
  }
}

export function decodePublicAccount(cbor: Buffer): AirGapPublicAccount {
  const inspected = inspectProfile(cbor, 'crypto-hdkey')
  const fingerprint = uint(map(tagged(inspected.get(6), 304), [1, 2, 3]).get(2))
    .toString(16)
    .padStart(8, '0')
  const record = CryptoHDKey.fromCBOR(cbor)
  if (record.isMaster() || record.isPrivateKey()) {
    throw invalid()
  }
  const origin = record.getOrigin()
  return AirGapPublicAccountSchema.parse({
    publicKey: record.getKey().toString('hex'),
    chainCode: record.getChainCode().toString('hex'),
    originPath: `m/${origin.getPath()}`,
    sourceFingerprint: fingerprint,
    name: record.getName() || 'AirGap Vault'
  })
}
export function airGapId(record: AirGapPublicAccount) {
  const { publicKey, chainCode, originPath, sourceFingerprint } = AirGapPublicAccountSchema.parse(record)
  return `airgap:${createHash('sha256')
    .update(JSON.stringify([publicKey, chainCode, originPath, sourceFingerprint]))
    .digest('hex')}`
}
export function deriveAirGapAddresses(record: AirGapPublicAccount): string[] {
  const valid = AirGapPublicAccountSchema.parse(record)
  const branch = new HDKey({
    publicKey: Buffer.from(valid.publicKey, 'hex'),
    chainCode: Buffer.from(valid.chainCode, 'hex')
  }).deriveChild(0)
  if (!branch.publicKey || !branch.chainCode) {
    throw invalid()
  }
  let addresses: string[] = []
  deriveHDAccounts(
    Buffer.from(branch.publicKey).toString('hex'),
    Buffer.from(branch.chainCode).toString('hex'),
    (error, result) => {
      if (error) {
        throw error
      }
      addresses = result!
    }
  )
  return addresses
}
export function chainNumber(value: string | number | bigint) {
  const chain = BigInt(value)
  if (chain < 1n || chain > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Unsupported AirGap chain ID')
  }
  return Number(chain)
}
export function transactionPreimage(tx: TypedTransaction) {
  if (tx.type !== 0 && tx.type !== 2) {
    throw new Error('AirGap supports legacy and type 2 transactions only')
  }
  if (!tx.to) {
    throw new Error('AirGap does not support contract creation')
  }
  const message = tx.getMessageToSign()
  return Buffer.from(tx.type === 0 ? RLP.encode(message) : (message as Uint8Array))
}
export function requestFrames(
  record: AirGapPublicAccount,
  index: number,
  sessionId: string,
  chainId: number,
  dataType: DataType,
  signData: Buffer,
  address: string
) {
  if (signData.length > MAX_MESSAGE) {
    throw new Error('AirGap request is too large')
  }
  const components = [
    ...record.originPath
      .slice(2)
      .split('/')
      .map((component) => new PathComponent({ index: Number(component.slice(0, -1)), hardened: true })),
    new PathComponent({ index: 0, hardened: false }),
    new PathComponent({ index, hardened: false })
  ]
  const request = new EthSignRequest({
    requestId: Buffer.from(sessionId.replaceAll('-', ''), 'hex'),
    signData,
    dataType,
    chainId: chainNumber(chainId),
    derivationPath: new CryptoKeypath(components, Buffer.from(record.sourceFingerprint, 'hex')),
    address: Buffer.from(address.slice(2), 'hex'),
    origin: 'Newframe'
  })
  const ur = request.toUR()
  if (ur.cbor.length > MAX_MESSAGE) {
    throw new Error('AirGap request is too large')
  }
  // Budget the pinned encoder's padded partition before allocating its fragments.
  const count = Math.ceil(ur.cbor.length / 250)
  const fragmentLength = Math.ceil(ur.cbor.length / count)
  if (count * fragmentLength > MAX_MESSAGE) {
    throw new Error('AirGap request is too large')
  }
  const encoder = new UREncoder(ur, 250)
  if (
    encoder.messageLength > MAX_MESSAGE ||
    encoder.fragmentsLength > 512 ||
    encoder.fragments.reduce((total, fragment) => total + fragment.length, 0) > MAX_MESSAGE
  ) {
    throw new Error('AirGap request is too large')
  }
  const frames = encoder.encodeWhole()
  if (frames.length > 512 || frames.some((frame) => frame.length > 4096)) {
    throw new Error('AirGap request is too large')
  }
  return frames
}
export function decodeSignature(cbor: Buffer, sessionId: string, kind: DataType, chainId: number) {
  inspectProfile(cbor, 'eth-signature')
  const response = ETHSignature.fromCBOR(cbor)
  if (!response.getRequestId()?.equals(Buffer.from(sessionId.replaceAll('-', ''), 'hex'))) {
    throw new Error('QR belongs to a different signing request')
  }
  const signature = response.getSignature()
  const r = signature.subarray(0, 32).toString('hex'),
    s = signature.subarray(32, 64).toString('hex')
  const order = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n
  if (
    BigInt(`0x${r}`) < 1n ||
    BigInt(`0x${r}`) >= order ||
    BigInt(`0x${s}`) < 1n ||
    BigInt(`0x${s}`) > order / 2n
  ) {
    throw new Error('Invalid AirGap signature scalars')
  }
  if (kind !== DataType.transaction && signature.length !== 65) {
    throw new Error('Invalid AirGap signature width')
  }
  let rawV = BigInt(`0x${signature.subarray(64).toString('hex')}`)
  if (kind === DataType.personalMessage && (rawV === 0n || rawV === 1n)) {
    rawV += 27n
  }
  const base =
    kind === DataType.transaction ? BigInt(chainId) * 2n + 35n : kind === DataType.typedTransaction ? 0n : 27n
  const parity = rawV - base
  if (parity !== 0n && parity !== 1n) {
    throw new Error('AirGap response has the wrong chain or signature parity')
  }
  return { r, s, v: rawV.toString(16), signature: `0x${r}${s}${(27n + parity).toString(16)}` }
}
