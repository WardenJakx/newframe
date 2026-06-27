import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { app, safeStorage, systemPreferences } from 'electron'

const USER_DATA = app
  ? app.getPath('userData')
  : path.resolve(path.dirname(require.main!.filename), '../.userData')
const BIOMETRICS_PATH = path.resolve(USER_DATA, 'biometrics.json')

type BiometricMethod = 'webauthn' | 'native'

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
  if (!/^[0-9a-f]{64}$/i.test(normalized)) throw new Error('Invalid vault key')
  return normalized
}

const secretToKey = (secret: string) => {
  const normalized = normalizeHex(secret || '')
  if (!/^[0-9a-f]+$/i.test(normalized) || normalized.length < 32) {
    throw new Error('Invalid biometric secret')
  }

  return crypto
    .createHash('sha256')
    .update('frame-biometric-vault-v1')
    .update(Buffer.from(normalized, 'hex'))
    .digest()
}

const validateCredential = (credential: StoredWebAuthnCredential) => {
  if (!credential || credential.version !== 1) throw new Error('Invalid biometric credential')
  if (!/^[0-9a-f]+$/i.test(normalizeHex(credential.credentialId))) {
    throw new Error('Invalid biometric credential id')
  }
  if (!/^[0-9a-f]{64}$/i.test(normalizeHex(credential.salt))) {
    throw new Error('Invalid biometric credential salt')
  }
}

const nativeAvailable = () => {
  if (process.platform !== 'darwin') return false
  if (typeof systemPreferences?.canPromptTouchID !== 'function') return false
  if (typeof systemPreferences?.promptTouchID !== 'function') return false
  if (typeof safeStorage?.isEncryptionAvailable !== 'function') return false
  if (typeof safeStorage?.encryptString !== 'function') return false
  if (typeof safeStorage?.decryptString !== 'function') return false

  try {
    return systemPreferences.canPromptTouchID() && safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

const promptTouchID = async (reason: string) => {
  if (!nativeAvailable()) throw new Error('Biometrics are not available on this device')

  try {
    await systemPreferences.promptTouchID(reason)
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

    return {
      enabled: !!biometric,
      method: (biometric?.method || '') as BiometricMethod | '',
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

    const encryptedKey = safeStorage.encryptString(key).toString('base64')

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
      if (biometric.method !== 'native') throw new Error('Biometric unlock method mismatch')
      await promptTouchID('unlock Newframe')
      return safeStorage.decryptString(Buffer.from(biometric.encryptedKey, 'base64'))
    }

    if (biometric.method !== 'webauthn') throw new Error('Biometric unlock method mismatch')

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
    if (this.exists()) fs.unlinkSync(BIOMETRICS_PATH)
  }

  private write(biometric: BiometricsFile) {
    fs.mkdirSync(USER_DATA, { recursive: true })
    fs.writeFileSync(BIOMETRICS_PATH, JSON.stringify(biometric), { mode: 0o600 })
  }

  private read(): BiometricsFile {
    if (!this.exists()) throw new Error('Biometric unlock is not enabled')

    const biometric = JSON.parse(fs.readFileSync(BIOMETRICS_PATH, 'utf8')) as BiometricsFile
    if (biometric.version !== 1) throw new Error('Unsupported biometric unlock data')
    if (biometric.method === 'webauthn') validateCredential(biometric.credential)
    if (biometric.method !== 'webauthn' && biometric.method !== 'native') {
      throw new Error('Unsupported biometric unlock method')
    }

    return biometric
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
