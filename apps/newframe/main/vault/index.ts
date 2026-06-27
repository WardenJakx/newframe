import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { app } from 'electron'
import log from 'electron-log'

import zxcvbn from '../../resources/zxcvbn'

// Mock user data dir during tests
const USER_DATA = app
  ? app.getPath('userData')
  : path.resolve(path.dirname(require.main!.filename), '../.userData')
const VAULT_PATH = path.resolve(USER_DATA, 'vault.json')

const KDF_PARAMS = { N: 32768, r: 8, p: 1, maxmem: 36000000 }

interface VaultFile {
  version: number
  salt: string
  iv: string
  encryptedKey: string
  keyHash: string
  kdf: { N: number; r: number; p: number }
}

const validatePassword = (password: string) => {
  if (!password) return new Error('Password required')
  if (password.length < 12) return new Error('Password is too short, must be 12 or more characters')
  if (zxcvbn(password).score < 3) return new Error('Password is too weak')
}

const deriveKey = (password: string, salt: Buffer) => crypto.scryptSync(password, salt, 32, KDF_PARAMS)

const hashKey = (key: Buffer) => crypto.createHash('sha256').update(key).digest('hex')

// The vault holds a single random key used to encrypt all hot signer secrets.
// The key is wrapped with a key derived from the user's master password, so
// changing the password only re-wraps the vault key
class Vault {
  private key: string | null = null

  exists() {
    return fs.existsSync(VAULT_PATH)
  }

  isUnlocked() {
    return this.key !== null
  }

  getKey() {
    return this.key
  }

  create(password: string) {
    if (this.exists()) throw new Error('Vault already exists')

    const err = validatePassword(password)
    if (err) throw err

    const vaultKey = crypto.randomBytes(32)
    this.write(vaultKey, password)
    this.key = vaultKey.toString('hex')

    log.info('Vault created')
    return this.key
  }

  unlock(password: string) {
    if (!password) throw new Error('Password required')

    const vault = this.read()
    const derivedKey = deriveKey(password, Buffer.from(vault.salt, 'hex'))

    let vaultKey
    try {
      const decipher = crypto.createDecipheriv('aes-256-cbc', derivedKey, Buffer.from(vault.iv, 'hex'))
      vaultKey = Buffer.concat([decipher.update(Buffer.from(vault.encryptedKey, 'hex')), decipher.final()])
    } catch (e) {
      throw new Error('Incorrect password', { cause: e })
    }

    // CBC padding can occasionally pass with the wrong key, verify against stored hash
    if (hashKey(vaultKey) !== vault.keyHash) throw new Error('Incorrect password')

    this.key = vaultKey.toString('hex')
    log.info('Vault unlocked')
    return this.key
  }

  unlockWithKey(vaultKeyHex: string) {
    if (!vaultKeyHex) throw new Error('Vault key required')

    const vaultKey = Buffer.from(vaultKeyHex, 'hex')
    if (vaultKey.length !== 32) throw new Error('Invalid vault key')

    const vault = this.read()
    if (hashKey(vaultKey) !== vault.keyHash) {
      throw new Error('Biometric credential does not match this vault')
    }

    this.key = vaultKey.toString('hex')
    log.info('Vault unlocked')
    return this.key
  }

  lock() {
    this.key = null
    log.info('Vault locked')
  }

  // Returns the vault key, creating or unlocking the vault with the given
  // password as needed
  acquireKey(password?: string) {
    if (this.isUnlocked()) return this.key as string
    if (this.exists()) return this.unlock(password || '')
    return this.create(password || '')
  }

  changePassword(oldPassword: string, newPassword: string) {
    const err = validatePassword(newPassword)
    if (err) throw err

    const vaultKey = Buffer.from(this.unlock(oldPassword), 'hex')
    this.write(vaultKey, newPassword)

    log.info('Vault password changed')
  }

  summary() {
    return { exists: this.exists(), unlocked: this.isUnlocked() }
  }

  private write(vaultKey: Buffer, password: string) {
    const salt = crypto.randomBytes(16)
    const iv = crypto.randomBytes(16)
    const derivedKey = deriveKey(password, salt)

    const cipher = crypto.createCipheriv('aes-256-cbc', derivedKey, iv)
    const encryptedKey = Buffer.concat([cipher.update(vaultKey), cipher.final()])

    const vault: VaultFile = {
      version: 1,
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
      encryptedKey: encryptedKey.toString('hex'),
      keyHash: hashKey(vaultKey),
      kdf: { N: KDF_PARAMS.N, r: KDF_PARAMS.r, p: KDF_PARAMS.p }
    }

    fs.mkdirSync(USER_DATA, { recursive: true })
    fs.writeFileSync(VAULT_PATH, JSON.stringify(vault), { mode: 0o600 })
  }

  private read(): VaultFile {
    if (!this.exists()) throw new Error('No vault found')
    return JSON.parse(fs.readFileSync(VAULT_PATH, 'utf8'))
  }
}

export default new Vault()
