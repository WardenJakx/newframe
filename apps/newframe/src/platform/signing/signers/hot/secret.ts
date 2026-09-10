import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

export interface EncryptedSecret {
  algorithm: 'aes-256-gcm'
  iv: string
  authTag: string
  ciphertext: string
}

const hex = /^[0-9a-f]+$/i

function vaultKey(vaultKeyHex: string) {
  if (typeof vaultKeyHex !== 'string' || vaultKeyHex.length !== 64 || !hex.test(vaultKeyHex)) {
    throw new Error('Vault key must be 32 bytes encoded as hex')
  }
  return Buffer.from(vaultKeyHex, 'hex')
}

function decode(value: string, bytes: number | undefined, field: string) {
  if (typeof value !== 'string' || value.length % 2 !== 0 || (value.length > 0 && !hex.test(value))) {
    throw new Error(`Invalid encrypted secret ${field}`)
  }
  const decoded = Buffer.from(value, 'hex')
  if (bytes !== undefined && decoded.length !== bytes) {
    throw new Error(`Invalid encrypted secret ${field}`)
  }
  return decoded
}

export function sealSecret(secret: Buffer, vaultKeyHex: string): EncryptedSecret {
  const key = vaultKey(vaultKeyHex)
  try {
    const iv = randomBytes(12)
    const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: 16 })
    const ciphertext = Buffer.concat([cipher.update(secret), cipher.final()])
    return {
      algorithm: 'aes-256-gcm',
      iv: iv.toString('hex'),
      authTag: cipher.getAuthTag().toString('hex'),
      ciphertext: ciphertext.toString('hex')
    }
  } finally {
    key.fill(0)
  }
}

export function openSecret(envelope: EncryptedSecret, vaultKeyHex: string): Buffer {
  if (!envelope || envelope.algorithm !== 'aes-256-gcm') {
    throw new Error('Unsupported encrypted secret')
  }

  const key = vaultKey(vaultKeyHex)
  let updated: Buffer | undefined
  let final: Buffer | undefined
  try {
    const iv = decode(envelope.iv, 12, 'IV')
    const authTag = decode(envelope.authTag, 16, 'authentication tag')
    const ciphertext = decode(envelope.ciphertext, undefined, 'ciphertext')
    const decipher = createDecipheriv('aes-256-gcm', key, iv, { authTagLength: 16 })
    decipher.setAuthTag(authTag)
    updated = decipher.update(ciphertext)
    final = decipher.final()
    return Buffer.concat([updated, final])
  } finally {
    updated?.fill(0)
    final?.fill(0)
    key.fill(0)
  }
}
