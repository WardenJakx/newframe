import fs from 'node:fs'
import path from 'node:path'

import { stripHexPrefix } from '@ethereumjs/util'
import { app } from 'electron'
import log from 'electron-log'
import { Mnemonic, randomBytes } from 'ethers'
import { z } from 'zod'

import type Signer from '../Signer/index.js'
import type { VaultAccess } from './HotSigner/index.js'
import RingSigner from './RingSigner/index.js'
import SeedSigner from './SeedSigner/index.js'

type VaultPort = VaultAccess & { acquireKey(password?: string): string }
type SignerCollection = { add(signer: Signer): void; exists(id: string): boolean }

const USER_DATA = app ? app.getPath('userData') : path.resolve(import.meta.dirname, '../.userData')
const SIGNERS_PATH = path.resolve(USER_DATA, 'signers')

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
  const files = fs.readdirSync(SIGNERS_PATH)

  for (const file of files) {
    try {
      const parsed = StoredHotSignerSchema.safeParse(
        JSON.parse(fs.readFileSync(path.resolve(SIGNERS_PATH, file), 'utf8'))
      )
      if (!parsed.success) {
        log.warn(`Skipping unsupported or malformed hot signer record: ${file}`)
        continue
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
