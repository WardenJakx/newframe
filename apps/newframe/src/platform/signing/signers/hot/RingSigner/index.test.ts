import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { rm } from 'node:fs/promises'
import log from 'electron-log'
import { keccak256 } from 'ethers'

import { electronMock } from '../../../../../../test/support/electron.mock.ts'
import { callbackResult, exerciseHotSignerContract } from '../../callback.test-support.ts'

const SIGNER_PATH = path.resolve(import.meta.dirname, '../.userData/signers')
const FILE_PATH = path.resolve(import.meta.dirname, 'keystore.test-fixture.json')
const removePath = (target: string) => rm(target, { recursive: true, force: true })
const vaultKey = '34'.repeat(32)
let unlocked = true
const vault = {
  acquireKey: () => {
    unlocked = true
    return vaultKey
  },
  getKey: () => (unlocked ? vaultKey : null),
  lock: () => {
    unlocked = false
  }
}
const readKeystore = () => JSON.parse(fs.readFileSync(FILE_PATH, 'utf8'))
const sealLegacyText = (value: string, key: string) => {
  const salt = Buffer.alloc(16, 3)
  const iv = Buffer.alloc(16, 4)
  const derivedKey = crypto.scryptSync(key, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 36000000 })
  const cipher = crypto.createCipheriv('aes-256-cbc', derivedKey, iv)
  const ciphertext = Buffer.concat([cipher.update(value), cipher.final()])
  derivedKey.fill(0)
  return `${salt.toString('hex')}:${iv.toString('hex')}:${ciphertext.toString('hex')}`
}
const createV1Keystore = (privateKey: Buffer, password: string) => {
  const salt = crypto.randomBytes(16)
  const iv = crypto.randomBytes(16)
  const derivedKey = crypto.scryptSync(password, salt, 32, { N: 1024, r: 8, p: 1 })
  const cipherKeyMaterial = Buffer.from(keccak256(derivedKey.subarray(0, 16)).slice(2), 'hex')
  const cipher = crypto.createCipheriv('aes-128-cbc', cipherKeyMaterial.subarray(0, 16), iv)
  cipher.setAutoPadding(false)
  const ciphertext = Buffer.concat([cipher.update(privateKey), cipher.final()])
  const mac = keccak256(Buffer.concat([derivedKey.subarray(16, 32), ciphertext])).slice(2)
  derivedKey.fill(0)
  cipherKeyMaterial.fill(0)
  return {
    Version: '1',
    Crypto: {
      CipherText: ciphertext.toString('hex'),
      IV: iv.toString('hex'),
      KeyHeader: { Kdf: 'scrypt', KdfParams: { DkLen: 32, N: 1024, P: 1, R: 8 } },
      MAC: mac,
      Salt: salt.toString('hex')
    }
  }
}

let hot: typeof import('..')

describe('Ring signer', () => {
  let signer: any
  let privateKey = ''

  beforeAll(async () => {
    log.transports.console.level = false
    electronMock.app.getPath.mockReturnValue(path.resolve(import.meta.dirname, '../.userData'))
    await removePath(SIGNER_PATH)
    hot = await import('..')
  })

  afterAll(async () => {
    await removePath(SIGNER_PATH)
    log.transports.console.level = 'debug'
  })

  test('rejects invalid private keys and keystores', async () => {
    await expect(
      callbackResult((done) =>
        hot.createFromPrivateKey(vault, { add: () => {}, exists: () => false }, 'invalid', '', done)
      )
    ).rejects.toThrow('Invalid private key')
    await expect(
      callbackResult((done) =>
        hot.createFromKeystore(
          vault,
          { add: () => {}, exists: () => false },
          { invalid: true },
          'test',
          '',
          done
        )
      )
    ).rejects.toThrow('Invalid keystore version')
  })

  test('stores one envelope per address and loads without rewriting', async () => {
    privateKey = crypto.randomBytes(32).toString('hex')
    signer = await callbackResult((done) =>
      hot.createFromPrivateKey(vault, { add: () => {}, exists: () => false }, privateKey, '', done)
    )
    const signerFile = path.resolve(SIGNER_PATH, `${signer.id}.json`)
    const before = fs.readFileSync(signerFile, 'utf8')
    const stored = JSON.parse(before)
    expect(stored).toMatchObject({ version: 1, type: 'ring' })
    expect(stored.encryptedKeys).toHaveLength(1)
    expect(stored.encryptedKeys[0].algorithm).toBe('aes-256-gcm')

    const loaded: any[] = []
    fs.writeFileSync(
      path.resolve(SIGNER_PATH, 'malformed-ring.json'),
      JSON.stringify({
        ...stored,
        encryptedKeys: [{ ...stored.encryptedKeys[0], ciphertext: '00' }]
      })
    )
    hot.load({ add: (value) => loaded.push(value), exists: () => false }, vault)
    expect(loaded).toHaveLength(1)
    expect(fs.readFileSync(signerFile, 'utf8')).toBe(before)
  })

  test('migrates and loads a legacy private-key bundle after the vault unlocks', () => {
    const signerFile = path.resolve(SIGNER_PATH, `${signer.id}.json`)
    const current = JSON.parse(fs.readFileSync(signerFile, 'utf8'))
    const legacy = {
      id: current.id,
      addresses: current.addresses,
      type: 'ring',
      encryptedKeys: sealLegacyText(privateKey, vaultKey)
    }
    fs.writeFileSync(signerFile, JSON.stringify(legacy), { mode: 0o600 })

    unlocked = false
    const deferred: any[] = []
    hot.load({ add: (value) => deferred.push(value), exists: () => false }, vault)
    expect(deferred).toHaveLength(0)
    expect(JSON.parse(fs.readFileSync(signerFile, 'utf8'))).toEqual(legacy)

    unlocked = true
    const loaded: any[] = []
    hot.load({ add: (value) => loaded.push(value), exists: () => false }, vault)
    expect(loaded).toHaveLength(1)
    signer = loaded[0]
    const migrated = JSON.parse(fs.readFileSync(signerFile, 'utf8'))
    expect(migrated).toMatchObject({ version: 1, id: legacy.id, addresses: legacy.addresses, type: 'ring' })
    expect(migrated.encryptedKeys).toHaveLength(1)
    expect(migrated.encryptedKeys[0].algorithm).toBe('aes-256-gcm')
    expect(JSON.stringify(migrated)).not.toContain(privateKey)
  })

  test('opens only the targeted envelope and removes without decrypting peers', async () => {
    unlocked = true
    await callbackResult((done) =>
      signer.addPrivateKey(crypto.randomBytes(32).toString('hex'), vaultKey, done)
    )
    const first = signer.encryptedKeys[0]
    signer.encryptedKeys[0] = { ...first, authTag: '00'.repeat(16) }
    await expect(callbackResult((done) => signer.exportPrivateKey(1, done))).resolves.toMatch(
      /^0x[0-9a-f]{64}$/
    )
    await callbackResult((done) => signer.removePrivateKey(1, vaultKey, done))
    expect(signer.encryptedKeys).toHaveLength(1)
    signer.encryptedKeys[0] = first
  })

  test('imports external V1 and V3 keystores', async () => {
    unlocked = true
    const v1 = await callbackResult<any>((done) =>
      hot.createFromKeystore(
        vault,
        { add: () => {}, exists: () => false },
        createV1Keystore(crypto.randomBytes(32), 'test'),
        'test',
        '',
        done
      )
    )
    const v3 = await callbackResult<any>((done) =>
      hot.createFromKeystore(vault, { add: () => {}, exists: () => false }, readKeystore(), 'test', '', done)
    )
    expect(v1.addresses[0]).toBe(v1.addresses[0].toLowerCase())
    expect(v3.addresses[0]).toBe(v3.addresses[0].toLowerCase())
  })

  test('signs and exports only while the vault is unlocked', async () => {
    unlocked = true
    await exerciseHotSignerContract(signer, vault)
  })
})
