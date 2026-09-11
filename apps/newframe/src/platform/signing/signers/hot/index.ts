import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import log from 'electron-log'
import { HDKey } from '@scure/bip32'
import { stripHexPrefix } from '@ethereumjs/util'
import { computeAddress, Mnemonic, randomBytes } from 'ethers'
import { z } from 'zod'

import RingSigner from './RingSigner/index.js'
import SeedSigner from './SeedSigner/index.js'
import { sealSecret } from './secret.js'
import type Signer from '../Signer/index.js'
import type { VaultAccess } from './HotSigner/index.js'

type VaultPort = VaultAccess & { acquireKey(password?: string): string }
type SignerCollection = { add(signer: Signer): void; exists(id: string): boolean }

const USER_DATA = app ? app.getPath('userData') : path.resolve(import.meta.dirname, '../.userData')
const SIGNERS_PATH = path.resolve(USER_DATA, 'signers')
const LEGACY_KDF_PARAMS = { N: 32768, r: 8, p: 1, maxmem: 36000000 }

const encryptedSecretSchema = (ciphertextBytes: number) =>
  z.strictObject({
    algorithm: z.literal('aes-256-gcm'),
    iv: z.string().regex(/^[0-9a-fA-F]{24}$/),
    authTag: z.string().regex(/^[0-9a-fA-F]{32}$/),
    ciphertext: z.string().regex(new RegExp(`^[0-9a-fA-F]{${ciphertextBytes * 2}}$`))
  })

const StoredSignerBase = {
  version: z.literal(1),
  id: z.string().min(1),
  addresses: z.array(z.string().min(1)),
  network: z.string().optional()
}

export const StoredHotSignerSchema = z.discriminatedUnion('type', [
  z.strictObject({
    ...StoredSignerBase,
    type: z.literal('seed'),
    encryptedSeed: encryptedSecretSchema(64)
  }),
  z.strictObject({
    ...StoredSignerBase,
    type: z.literal('ring'),
    encryptedKeys: z.array(encryptedSecretSchema(32))
  })
])

export type StoredHotSigner = z.infer<typeof StoredHotSignerSchema>

const LegacySignerBase = {
  id: z.string().min(1),
  addresses: z.array(z.string().min(1)),
  network: z.string().optional()
}

const LegacyHotSignerSchema = z.discriminatedUnion('type', [
  z.strictObject({
    ...LegacySignerBase,
    type: z.literal('seed'),
    encryptedSeed: z.string().min(1)
  }),
  z.strictObject({
    ...LegacySignerBase,
    type: z.literal('ring'),
    encryptedKeys: z.string().min(1)
  })
])

type LegacyHotSigner = z.infer<typeof LegacyHotSignerSchema>

function openLegacySecret(value: string, vaultKeyHex: string) {
  const parts = value.split(':')
  if (parts.length !== 3) throw new Error('Invalid legacy encrypted secret')
  const [saltHex, ivHex, ciphertextHex] = parts
  if (
    !/^[0-9a-fA-F]{32}$/.test(saltHex) ||
    !/^[0-9a-fA-F]{32}$/.test(ivHex) ||
    !/^[0-9a-fA-F]+$/.test(ciphertextHex) ||
    ciphertextHex.length % 32 !== 0
  ) {
    throw new Error('Invalid legacy encrypted secret')
  }

  const salt = Buffer.from(saltHex, 'hex')
  const derivedKey = crypto.scryptSync(vaultKeyHex, salt, 32, LEGACY_KDF_PARAMS)
  let updated: Buffer | undefined
  let final: Buffer | undefined
  try {
    const decipher = crypto.createDecipheriv('aes-256-cbc', derivedKey, Buffer.from(ivHex, 'hex'))
    updated = decipher.update(Buffer.from(ciphertextHex, 'hex'))
    final = decipher.final()
    return Buffer.concat([updated, final])
  } finally {
    salt.fill(0)
    derivedKey.fill(0)
    updated?.fill(0)
    final?.fill(0)
  }
}

function deriveSeedAddresses(seed: Buffer) {
  const root = HDKey.fromMasterSeed(seed)
  try {
    return Array.from({ length: 100 }, (_, index) => {
      const child = root.derive(`m/44'/60'/0'/0/${index}`)
      try {
        if (!child.publicKey) throw new Error('Unable to derive public key')
        return computeAddress(`0x${Buffer.from(child.publicKey).toString('hex')}`)
      } finally {
        child.wipePrivateData()
      }
    })
  } finally {
    root.wipePrivateData()
  }
}

function sameAddresses(actual: string[], expected: string[]) {
  return (
    actual.length === expected.length &&
    actual.every((address, index) => address.toLowerCase() === expected[index].toLowerCase())
  )
}

function migrateLegacySigner(record: LegacyHotSigner, vaultKeyHex: string): StoredHotSigner {
  if (record.type === 'seed') {
    const plaintext = openLegacySecret(record.encryptedSeed, vaultKeyHex)
    let seed: Buffer | undefined
    try {
      const seedHex = plaintext.toString('utf8')
      if (!/^[0-9a-fA-F]{128}$/.test(seedHex)) throw new Error('Invalid legacy seed')
      seed = Buffer.from(seedHex, 'hex')
      if (!sameAddresses(deriveSeedAddresses(seed), record.addresses)) {
        throw new Error('Legacy seed does not match stored addresses')
      }
      return StoredHotSignerSchema.parse({
        version: 1,
        id: record.id,
        addresses: record.addresses,
        network: record.network,
        type: 'seed',
        encryptedSeed: sealSecret(seed, vaultKeyHex)
      })
    } finally {
      plaintext.fill(0)
      seed?.fill(0)
    }
  }

  const plaintext = openLegacySecret(record.encryptedKeys, vaultKeyHex)
  const keyBuffers: Buffer[] = []
  try {
    const keys = plaintext.toString('utf8').split(':')
    if (keys.length !== record.addresses.length || keys.some((key) => !/^[0-9a-fA-F]{64}$/.test(key))) {
      throw new Error('Invalid legacy private keys')
    }
    for (const key of keys) keyBuffers.push(Buffer.from(key, 'hex'))
    const addresses = keyBuffers.map((key) => computeAddress(`0x${key.toString('hex')}`))
    if (!sameAddresses(addresses, record.addresses)) {
      throw new Error('Legacy private keys do not match stored addresses')
    }
    return StoredHotSignerSchema.parse({
      version: 1,
      id: record.id,
      addresses: record.addresses,
      network: record.network,
      type: 'ring',
      encryptedKeys: keyBuffers.map((key) => sealSecret(key, vaultKeyHex))
    })
  } finally {
    plaintext.fill(0)
    keyBuffers.forEach((key) => key.fill(0))
  }
}

function writeMigratedSigner(signerPath: string, record: StoredHotSigner) {
  const temporaryPath = `${signerPath}.migration-${process.pid}-${crypto.randomBytes(8).toString('hex')}`
  try {
    fs.writeFileSync(temporaryPath, JSON.stringify(record), { flag: 'wx', mode: 0o600 })
    fs.chmodSync(temporaryPath, 0o600)
    fs.renameSync(temporaryPath, signerPath)
  } finally {
    fs.rmSync(temporaryPath, { force: true })
  }
}

export const newPhrase = (cb: Callback<string>) => {
  cb(null, Mnemonic.fromEntropy(randomBytes(16)).phrase)
}

const acquireVaultKey = (vault: VaultPort, password: string, cb: Callback<any>) => {
  try {
    return vault.acquireKey(password)
  } catch (error) {
    cb(error as Error, undefined)
  }
}

export const createFromSeed = (
  vault: VaultPort,
  signers: SignerCollection,
  seed: string,
  password: string,
  cb: Callback<Signer>
) => {
  if (!seed) return cb(new Error('Seed required to create hot signer'), undefined)
  const vaultKey = acquireVaultKey(vault, password, cb)
  if (!vaultKey) return
  const signer = new SeedSigner(undefined, vault)
  signer.addSeed(seed, vaultKey, (error) => {
    if (error) return cb(error, undefined)
    signers.add(signer)
    cb(null, signer)
  })
}

export const createFromPhrase = (
  vault: VaultPort,
  signers: SignerCollection,
  phrase: string,
  password: string,
  cb: Callback<Signer>
) => {
  if (!phrase) return cb(new Error('Phrase required to create hot signer'), undefined)
  const vaultKey = acquireVaultKey(vault, password, cb)
  if (!vaultKey) return
  const signer = new SeedSigner(undefined, vault)
  signer.addPhrase(phrase, vaultKey, (error) => {
    if (error) return cb(error, undefined)
    signers.add(signer)
    cb(null, signer)
  })
}

export const createFromPrivateKey = (
  vault: VaultPort,
  signers: SignerCollection,
  privateKey: string,
  password: string,
  cb: Callback<Signer>
) => {
  const privateKeyHex = stripHexPrefix(privateKey)
  if (!privateKeyHex) return cb(new Error('Private key required to create hot signer'), undefined)
  const vaultKey = acquireVaultKey(vault, password, cb)
  if (!vaultKey) return
  const signer = new RingSigner(undefined, vault)
  signer.addPrivateKey(privateKeyHex, vaultKey, (error) => {
    if (error) return cb(error, undefined)
    signers.add(signer)
    cb(null, signer)
  })
}

export const createFromKeystore = (
  vault: VaultPort,
  signers: SignerCollection,
  keystore: any,
  keystorePassword: string,
  password: string,
  cb: Callback<Signer>
) => {
  if (!keystore) return cb(new Error('Keystore required'), undefined)
  if (!keystorePassword) return cb(new Error('Keystore password required'), undefined)
  const vaultKey = acquireVaultKey(vault, password, cb)
  if (!vaultKey) return
  const signer = new RingSigner(undefined, vault)
  signer.addKeystore(keystore, keystorePassword, vaultKey, (error) => {
    if (error) return cb(error, undefined)
    signers.add(signer)
    cb(null, signer)
  })
}

export const load = (signers: SignerCollection, vault: VaultAccess) => {
  fs.mkdirSync(SIGNERS_PATH, { recursive: true })
  const files = fs
    .readdirSync(SIGNERS_PATH, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => entry.name)

  for (const file of files) {
    try {
      const signerPath = path.resolve(SIGNERS_PATH, file)
      const stored = JSON.parse(fs.readFileSync(signerPath, 'utf8'))
      let parsed = StoredHotSignerSchema.safeParse(stored)
      if (!parsed.success) {
        const legacy = LegacyHotSignerSchema.safeParse(stored)
        const vaultKey = vault.getKey()
        if (!legacy.success) {
          log.warn(`Skipping unsupported or malformed hot signer record: ${file}`)
          continue
        }
        if (!vaultKey) {
          log.info(`Deferring legacy hot signer migration until unlock: ${file}`)
          continue
        }
        const migrated = migrateLegacySigner(legacy.data, vaultKey)
        writeMigratedSigner(signerPath, migrated)
        parsed = { success: true, data: migrated }
        log.info(`Migrated legacy hot signer record: ${file}`)
      }

      const record = parsed.data
      if (
        (record.type === 'seed' && record.addresses.length !== 100) ||
        (record.type === 'ring' && record.addresses.length !== record.encryptedKeys.length)
      ) {
        log.warn(`Skipping malformed hot signer record: ${file}`)
        continue
      }
      const signer = record.type === 'seed' ? new SeedSigner(record, vault) : new RingSigner(record, vault)
      if (signer.fingerprint() !== record.id) {
        log.warn(`Skipping hot signer record with an invalid fingerprint: ${file}`)
        continue
      }
      if (!signers.exists(record.id)) signers.add(signer)
    } catch {
      log.warn(`Skipping unsupported or malformed hot signer record: ${file}`)
    }
  }
}

export default { newPhrase, createFromSeed, createFromPhrase, createFromPrivateKey, createFromKeystore, load }
