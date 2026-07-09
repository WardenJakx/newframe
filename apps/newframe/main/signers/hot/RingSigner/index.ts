import { createDecipheriv, scrypt as scryptAsync, type ScryptOptions } from 'crypto'
import path from 'path'
import log from 'electron-log'
import { keccak256, Wallet } from 'ethers'

import HotSigner from '../HotSigner'

type Callback = (err: Error | null, result?: any) => void
type V1Keystore = {
  Crypto: {
    CipherText: string
    IV: string
    KeyHeader: {
      Kdf: string
      KdfParams: {
        DkLen: number
        N: number
        P: number
        R: number
      }
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
      if (err) reject(err)
      else resolve(derivedKey)
    })
  })

async function decryptV1Keystore(keystore: V1Keystore, password: string) {
  if (keystore.Version !== '1') throw new Error('Not a V1 wallet')
  if (keystore.Crypto.KeyHeader.Kdf !== 'scrypt') throw new Error('Unsupported key derivation scheme')

  const { DkLen, N, P, R } = keystore.Crypto.KeyHeader.KdfParams
  const ciphertext = hexToBuffer(keystore.Crypto.CipherText)
  const maxmem = Math.max(32 * 1024 * 1024, 128 * N * R + 1024 * 1024)
  const derivedKey = await deriveScryptKey(password, hexToBuffer(keystore.Crypto.Salt), DkLen, {
    N,
    r: R,
    p: P,
    maxmem
  })

  const mac = stripHexPrefix(keccak256(Buffer.concat([derivedKey.subarray(16, 32), ciphertext])))
  if (mac.toLowerCase() !== keystore.Crypto.MAC.toLowerCase()) {
    throw new Error('Key derivation failed - possibly wrong passphrase')
  }

  const cipherKey = hexToBuffer(keccak256(derivedKey.subarray(0, 16))).subarray(0, 16)
  const decipher = createDecipheriv('aes-128-cbc', cipherKey, hexToBuffer(keystore.Crypto.IV))
  decipher.setAutoPadding(false)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('hex')
}

// compiled (electron) forks the emitted worker.js; under tests we run from source,
// so fork the .ts worker directly — node 24 strips types natively
const WORKER_EXT = __filename.endsWith('.ts') ? 'worker.ts' : 'worker.js'
const WORKER_PATH = path.resolve(__dirname, WORKER_EXT)

class RingSigner extends HotSigner {
  constructor(signer?: any) {
    super(signer, WORKER_PATH)
    this.type = 'ring'
    this.model = 'keyring'
    this.encryptedKeys = signer && signer.encryptedKeys
    if (this.encryptedKeys) this.update()
  }

  override save() {
    super.save({ encryptedKeys: this.encryptedKeys })
  }

  override unlock(password: string, cb: Callback) {
    super.unlock(password, { encryptedKeys: this.encryptedKeys }, cb)
  }

  addPrivateKey(key: string, password: string, cb: Callback) {
    // Validate private key
    let wallet: Wallet
    try {
      wallet = new Wallet(addHexPrefix(key))
    } catch (e) {
      return cb(new Error('Invalid private key'))
    }
    const address = wallet.address.toLowerCase()

    // Ensure private key hasn't already been added
    if (this.addresses.includes(address)) {
      return cb(new Error('Private key already added'))
    }

    // Call worker
    const params = { encryptedKeys: this.encryptedKeys, key, password }
    this._callWorker({ method: 'addKey', params }, (err, encryptedKeys) => {
      // Handle errors
      if (err) return cb(err)

      // Update addresses
      this.addresses = [...this.addresses, address]

      // Update encrypted keys
      this.encryptedKeys = encryptedKeys

      // Log and update signer
      log.info('Private key added to signer', this.id)
      this.update()

      // If signer was unlock -> update keys in worker
      this.unlock(password, cb)
    })
  }

  removePrivateKey(index: number, password: string, cb: Callback) {
    // Call worker
    const params = { encryptedKeys: this.encryptedKeys, index, password }
    this._callWorker({ method: 'removeKey', params }, (err, encryptedKeys) => {
      // Handle errors
      if (err) return cb(err)

      // Remove address at index
      this.addresses = this.addresses.filter((address) => address !== this.addresses[index])

      // Update encrypted keys
      this.encryptedKeys = encryptedKeys

      // Log and update signer
      log.info('Private key removed from signer', this.id)
      this.update()

      // If signer was unlock -> update keys in worker
      if (this.status === 'ok') this.lock(cb)
      else cb(null)
    })
  }

  // TODO: Encrypt all keys together so that they all get the same password
  async addKeystore(keystore: any, keystorePassword: string, password: string, cb: Callback) {
    let privateKey
    // Try to generate wallet from keystore
    try {
      const version = keystore.version ?? Number(keystore.Version)
      if (version === 1) privateKey = await decryptV1Keystore(keystore, keystorePassword)
      else if (version === 3)
        privateKey = (await Wallet.fromEncryptedJson(JSON.stringify(keystore), keystorePassword)).privateKey
      else return cb(new Error('Invalid keystore version'))
    } catch (e) {
      return cb(e as Error)
    }
    // Add private key
    this.addPrivateKey(stripHexPrefix(privateKey), password, cb)
  }
}

export default RingSigner
