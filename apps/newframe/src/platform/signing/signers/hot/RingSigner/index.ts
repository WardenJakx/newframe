import { createDecipheriv, scrypt as scryptAsync, type ScryptOptions } from 'node:crypto'

import log from 'electron-log'
import { keccak256, Wallet } from 'ethers'

import HotSigner, { type VaultAccess } from '../HotSigner/index.js'
import { openSecret, sealSecret, type EncryptedSecret } from '../secret.js'

type V1Keystore = {
  Crypto: {
    CipherText: string
    IV: string
    KeyHeader: {
      Kdf: string
      KdfParams: { DkLen: number; N: number; P: number; R: number }
    }
    MAC: string
    Salt: string
  }
  Version: string
}

const addHexPrefix = (value: string) => (value.startsWith('0x') ? value : `0x${value}`)
const stripHexPrefix = (value: string) => (value.startsWith('0x') ? value.slice(2) : value)
const hexToBuffer = (value: string) => Buffer.from(stripHexPrefix(value), 'hex')
const deriveScryptKey = (password: string, salt: Buffer, keylen: number, options: ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) => {
    scryptAsync(password, salt, keylen, options, (err, derivedKey) => {
      if (err) {
        reject(err)
      } else {
        resolve(derivedKey)
      }
    })
  })

async function decryptV1Keystore(keystore: V1Keystore, password: string) {
  if (keystore.Version !== '1') {
    throw new Error('Not a V1 wallet')
  }
  if (keystore.Crypto.KeyHeader.Kdf !== 'scrypt') {
    throw new Error('Unsupported key derivation scheme')
  }

  const { DkLen, N, P, R } = keystore.Crypto.KeyHeader.KdfParams
  const ciphertext = hexToBuffer(keystore.Crypto.CipherText)
  const salt = hexToBuffer(keystore.Crypto.Salt)
  const maxmem = Math.max(32 * 1024 * 1024, 128 * N * R + 1024 * 1024)
  const derivedKey = await deriveScryptKey(password, salt, DkLen, { N, r: R, p: P, maxmem })
  let macInput: Buffer | undefined
  let cipherKeyMaterial: Buffer | undefined
  let cipherKey: Buffer | undefined
  let updated: Buffer | undefined
  let final: Buffer | undefined
  try {
    macInput = Buffer.concat([derivedKey.subarray(16, 32), ciphertext])
    const mac = stripHexPrefix(keccak256(macInput))
    if (mac.toLowerCase() !== keystore.Crypto.MAC.toLowerCase()) {
      throw new Error('Key derivation failed - possibly wrong passphrase')
    }

    cipherKeyMaterial = hexToBuffer(keccak256(derivedKey.subarray(0, 16)))
    cipherKey = cipherKeyMaterial.subarray(0, 16)
    const decipher = createDecipheriv('aes-128-cbc', cipherKey, hexToBuffer(keystore.Crypto.IV))
    decipher.setAutoPadding(false)
    updated = decipher.update(ciphertext)
    final = decipher.final()
    return Buffer.concat([updated, final])
  } finally {
    derivedKey.fill(0)
    macInput?.fill(0)
    cipherKeyMaterial?.fill(0)
    updated?.fill(0)
    final?.fill(0)
    salt.fill(0)
  }
}

class RingSigner extends HotSigner {
  encryptedKeys: EncryptedSecret[]

  constructor(
    signer:
      | { id?: string; addresses?: string[]; network?: string; encryptedKeys?: EncryptedSecret[] }
      | undefined,
    vault: VaultAccess
  ) {
    super(signer, vault)
    this.type = 'ring'
    this.model = 'keyring'
    this.encryptedKeys = signer?.encryptedKeys ?? []
  }

  protected override persistedSecret() {
    return { encryptedKeys: this.encryptedKeys }
  }

  protected override openPrivateKey(index: number, vaultKeyHex: string) {
    const envelope = this.encryptedKeys.at(index)
    if (!envelope) {
      throw new Error('Private key not found')
    }
    return openSecret(envelope, vaultKeyHex)
  }

  addPrivateKey(key: string, vaultKeyHex: string, cb: Callback<RingSigner>) {
    let wallet: Wallet
    try {
      wallet = new Wallet(addHexPrefix(key))
    } catch {
      return cb(new Error('Invalid private key'), undefined)
    }
    const address = wallet.address.toLowerCase()
    if (this.addresses.includes(address)) {
      return cb(new Error('Private key already added'), undefined)
    }

    const keyBuffer = hexToBuffer(key)
    try {
      const envelope = sealSecret(keyBuffer, vaultKeyHex)
      this.addresses = [...this.addresses, address]
      this.encryptedKeys = [...this.encryptedKeys, envelope]
      log.info('Private key added to signer', this.id)
      this.update()
      cb(null, this)
    } catch (error) {
      cb(error as Error, undefined)
    } finally {
      keyBuffer.fill(0)
    }
  }

  removePrivateKey(index: number, _vaultKeyHex: string, cb: Callback<RingSigner>) {
    if (!this.encryptedKeys[index]) {
      return cb(new Error('Private key not found'), undefined)
    }
    this.addresses = this.addresses.filter((_, keyIndex) => keyIndex !== index)
    this.encryptedKeys = this.encryptedKeys.filter((_, keyIndex) => keyIndex !== index)
    log.info('Private key removed from signer', this.id)
    this.update()
    cb(null, this)
  }

  async addKeystore(keystore: any, keystorePassword: string, vaultKeyHex: string, cb: Callback<RingSigner>) {
    let privateKey: Buffer | undefined
    try {
      const version = keystore.version ?? Number(keystore.Version)
      if (version === 1) {
        privateKey = await decryptV1Keystore(keystore, keystorePassword)
      } else if (version === 3) {
        const wallet = await Wallet.fromEncryptedJson(JSON.stringify(keystore), keystorePassword)
        privateKey = hexToBuffer(wallet.privateKey)
      } else {
        return cb(new Error('Invalid keystore version'), undefined)
      }
      this.addPrivateKey(privateKey.toString('hex'), vaultKeyHex, cb)
    } catch (error) {
      cb(error as Error, undefined)
    } finally {
      privateKey?.fill(0)
    }
  }
}

export default RingSigner
