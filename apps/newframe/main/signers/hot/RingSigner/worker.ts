import HotSignerWorker from '../HotSigner/worker.ts'
import type { PseudoCallback, WorkerRPCMessage } from '../HotSigner/worker.ts'

class RingSignerWorker extends HotSignerWorker {
  keys: Buffer[] | null

  constructor() {
    super()
    this.keys = null
    process.on('message', (message: WorkerRPCMessage) => this.handleMessage(message))
  }

  unlock(
    { encryptedKeys, password }: { encryptedKeys: string; password: string },
    pseudoCallback: PseudoCallback
  ) {
    try {
      this.keys = this._decrypt(encryptedKeys, password)
        .split(':')
        .map((key) => Buffer.from(key, 'hex'))
      pseudoCallback(null)
    } catch (e) {
      pseudoCallback('Invalid password')
    }
  }

  lock(_: any, pseudoCallback: PseudoCallback) {
    this.keys = null
    pseudoCallback(null)
  }

  addKey(
    { encryptedKeys, key, password }: { encryptedKeys: string; key: string; password: string },
    pseudoCallback: PseudoCallback
  ) {
    let keys
    // If signer already has encrypted keys -> decrypt them and add new key
    if (encryptedKeys) keys = [...this._decryptKeys(encryptedKeys, password)!, key]
    // Else -> generate new list of keys
    else keys = [key]
    // Encrypt and return list of keys
    encryptedKeys = this._encryptKeys(keys, password)
    pseudoCallback(null, encryptedKeys)
  }

  reencryptKeys(
    {
      encryptedKeys,
      password,
      newPassword
    }: { encryptedKeys: string; password: string; newPassword: string },
    pseudoCallback: PseudoCallback
  ) {
    try {
      const keys = this._decrypt(encryptedKeys, password)
      pseudoCallback(null, this._encrypt(keys, newPassword))
    } catch (e) {
      pseudoCallback('Invalid password')
    }
  }

  removeKey(
    { encryptedKeys, index, password }: { encryptedKeys: string; index: number; password: string },
    pseudoCallback: PseudoCallback
  ) {
    if (!encryptedKeys) return pseudoCallback('Signer does not have any keys')
    // Get list of decrypted keys
    let keys = this._decryptKeys(encryptedKeys, password)!
    // Remove key from list
    keys = keys.filter((key) => key !== keys[index])
    // Return encrypted list (or null if empty)
    const result = keys.length > 0 ? this._encryptKeys(keys, password) : null
    pseudoCallback(null, result)
  }

  override signMessage({ index, message }: any, pseudoCallback: PseudoCallback) {
    // Make sure signer is unlocked
    if (!this.keys) return pseudoCallback('Signer locked')
    // Sign message
    super.signMessage(this.keys[index], message, pseudoCallback)
  }

  override signTypedData({ index, typedMessage }: any, pseudoCallback: PseudoCallback) {
    // Make sure signer is unlocked
    if (!this.keys) return pseudoCallback('Signer locked')
    // Sign Typed Data
    super.signTypedData(this.keys[index], typedMessage, pseudoCallback)
  }

  override signTransaction({ index, rawTx }: any, pseudoCallback: PseudoCallback) {
    // Make sure signer is unlocked
    if (!this.keys) return pseudoCallback('Signer locked')
    // Sign transaction
    super.signTransaction(this.keys[index], rawTx, pseudoCallback)
  }

  exportPrivateKey({ index }: { index: number }, pseudoCallback: PseudoCallback) {
    if (!this.keys) return pseudoCallback('Signer locked')

    const key = this.keys[index]
    if (!key) return pseudoCallback('Private key not found')

    pseudoCallback(null, '0x' + key.toString('hex'))
  }

  _decryptKeys(encryptedKeys: string, password: string) {
    if (!encryptedKeys) return null
    const keyString = this._decrypt(encryptedKeys, password)
    return keyString.split(':')
  }

  _encryptKeys(keys: string[], password: string) {
    const keyString = keys.join(':')
    return this._encrypt(keyString, password)
  }
}

const ringSignerWorker = new RingSignerWorker() // eslint-disable-line
