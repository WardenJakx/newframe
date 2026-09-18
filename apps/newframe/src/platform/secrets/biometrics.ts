import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

import { app, safeStorage, systemPreferences } from 'electron'

const electronApp = app as typeof app | undefined
const electronSafeStorage = safeStorage as typeof safeStorage | undefined
const electronSystemPreferences = systemPreferences as typeof systemPreferences | undefined
const USER_DATA = electronApp
  ? electronApp.getPath('userData')
  : path.resolve(import.meta.dirname, '../../../.userData')
const BIOMETRICS_PATH = path.resolve(USER_DATA, 'biometrics.json')

interface StoredWebAuthnCredential {
  version: 1
  credentialId: string
  salt: string
}

interface WebAuthnBiometricsFile {
  version: 1
  method: 'webauthn'
  credential: StoredWebAuthnCredential
  iv: string
  encryptedKey: string
  authTag: string
}

interface NativeBiometricsFile {
  version: 1
  method: 'native'
  encryptedKey: string
}

type BiometricsFile = WebAuthnBiometricsFile | NativeBiometricsFile

export type BiometricUnlockPayload =
  | {
      method: 'webauthn'
      secret: string
    }
  | {
      method: 'native'
    }

const normalizeHex = (value: string) => value.replace(/^0x/i, '')

const assertVaultKey = (vaultKey: string) => {
  const normalized = normalizeHex(vaultKey)
  if (!/^[0-9a-f]{64}$/i.test(normalized)) {
    throw new Error('Invalid vault key')
  }
  return normalized
}

const secretToKey = (secret: unknown) => {
  const normalized = normalizeHex(typeof secret === 'string' ? secret : '')
  if (!/^[0-9a-f]+$/i.test(normalized) || normalized.length < 32) {
    throw new Error('Invalid biometric secret')
  }

  return crypto
    .createHash('sha256')
    .update('frame-biometric-vault-v1')
    .update(Buffer.from(normalized, 'hex'))
    .digest()
}

function validateCredential(credential: unknown): asserts credential is StoredWebAuthnCredential {
  if (
    typeof credential !== 'object' ||
    credential === null ||
    !('version' in credential) ||
    credential.version !== 1
  ) {
    throw new Error('Invalid biometric credential')
  }
  if (
    !('credentialId' in credential) ||
    typeof credential.credentialId !== 'string' ||
    !/^[0-9a-f]+$/i.test(normalizeHex(credential.credentialId))
  ) {
    throw new Error('Invalid biometric credential id')
  }
  if (
    !('salt' in credential) ||
    typeof credential.salt !== 'string' ||
    !/^[0-9a-f]{64}$/i.test(normalizeHex(credential.salt))
  ) {
    throw new Error('Invalid biometric credential salt')
  }
}

const nativeAvailable = () => {
  if (process.platform !== 'darwin') {
    return false
  }
  if (typeof electronSystemPreferences?.canPromptTouchID !== 'function') {
    return false
  }
  if (typeof electronSystemPreferences.promptTouchID !== 'function') {
    return false
  }
  if (typeof electronSafeStorage?.encryptString !== 'function') {
    return false
  }
  if (typeof electronSafeStorage.decryptString !== 'function') {
    return false
  }

  try {
    return electronSystemPreferences.canPromptTouchID()
  } catch {
    return false
  }
}

const promptTouchID = async (reason: string) => {
  if (!nativeAvailable()) {
    throw new Error('Biometrics are not available on this device')
  }

  try {
    await electronSystemPreferences!.promptTouchID(reason)
  } catch (e) {
    throw new Error('Biometric authentication failed', { cause: e })
  }
}

class Biometrics {
  exists() {
    return fs.existsSync(BIOMETRICS_PATH)
  }

  summary() {
    const biometric = this.safeRead()
    const method: BiometricsFile['method'] | '' = biometric?.method ?? ''

    return {
      enabled: !!biometric,
      method,
      credential: biometric?.method === 'webauthn' ? biometric.credential : undefined,
      nativeAvailable: nativeAvailable()
    }
  }

  enableWebAuthn(vaultKey: string, credential: StoredWebAuthnCredential, secret: string) {
    validateCredential(credential)

    const key = Buffer.from(assertVaultKey(vaultKey), 'hex')
    const iv = crypto.randomBytes(12)
    const cipher = crypto.createCipheriv('aes-256-gcm', secretToKey(secret), iv)
    const encryptedKey = Buffer.concat([cipher.update(key), cipher.final()])

    this.write({
      version: 1,
      method: 'webauthn',
      credential: {
        version: 1,
        credentialId: normalizeHex(credential.credentialId),
        salt: normalizeHex(credential.salt)
      },
      iv: iv.toString('hex'),
      encryptedKey: encryptedKey.toString('hex'),
      authTag: cipher.getAuthTag().toString('hex')
    })
  }

  async enableNative(vaultKey: string) {
    const key = assertVaultKey(vaultKey)
    await promptTouchID('enable biometric unlock for Newframe')

    const encryptedKey = electronSafeStorage!.encryptString(key).toString('base64')

    this.write({
      version: 1,
      method: 'native',
      encryptedKey
    })
  }

  async unlock(payload: BiometricUnlockPayload) {
    const biometric = this.read()

    if (payload.method !== biometric.method) {
      throw new Error('Biometric unlock method mismatch')
    }

    if (payload.method === 'native') {
      if (biometric.method !== 'native') {
        throw new Error('Biometric unlock method mismatch')
      }
      await promptTouchID('unlock Newframe')
      return electronSafeStorage!.decryptString(Buffer.from(biometric.encryptedKey, 'base64'))
    }

    if (biometric.method !== 'webauthn') {
      throw new Error('Biometric unlock method mismatch')
    }

    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      secretToKey(payload.secret),
      Buffer.from(biometric.iv, 'hex')
    )
    decipher.setAuthTag(Buffer.from(biometric.authTag, 'hex'))

    const key = Buffer.concat([decipher.update(Buffer.from(biometric.encryptedKey, 'hex')), decipher.final()])

    return key.toString('hex')
  }

  disable() {
    if (this.exists()) {
      fs.unlinkSync(BIOMETRICS_PATH)
    }
  }

  private write(biometric: BiometricsFile) {
    fs.mkdirSync(USER_DATA, { recursive: true })
    fs.writeFileSync(BIOMETRICS_PATH, JSON.stringify(biometric), { mode: 0o600 })
  }

  private read(): BiometricsFile {
    if (!this.exists()) {
      throw new Error('Biometric unlock is not enabled')
    }

    const biometric: unknown = JSON.parse(fs.readFileSync(BIOMETRICS_PATH, 'utf8'))
    if (
      typeof biometric !== 'object' ||
      biometric === null ||
      !('version' in biometric) ||
      biometric.version !== 1
    ) {
      throw new Error('Unsupported biometric unlock data')
    }
    if (!('method' in biometric)) {
      throw new Error('Unsupported biometric unlock method')
    }
    if (biometric.method === 'webauthn') {
      if (!('credential' in biometric)) {
        throw new Error('Invalid biometric credential')
      }
      validateCredential(biometric.credential)
    }
    if (biometric.method !== 'webauthn' && biometric.method !== 'native') {
      throw new Error('Unsupported biometric unlock method')
    }

    return biometric as BiometricsFile
  }

  private safeRead() {
    try {
      return this.read()
    } catch {
      return null
    }
  }
}

export default new Biometrics()
