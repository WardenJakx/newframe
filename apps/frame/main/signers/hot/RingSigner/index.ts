import path from 'path'
import log from 'electron-log'
import { Wallet } from '@ethereumjs/wallet'

import HotSigner from '../HotSigner'

type Callback = (err: Error | null, result?: any) => void

// compiled (electron) forks the emitted worker.js; under jest we run from source,
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
    let wallet
    try {
      wallet = Wallet.fromPrivateKey(Buffer.from(key, 'hex'))
    } catch (e) {
      return cb(new Error('Invalid private key'))
    }
    const address = wallet.getAddressString()

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
    let wallet
    // Try to generate wallet from keystore
    try {
      if (keystore.version === 1) wallet = await Wallet.fromV1(keystore, keystorePassword)
      else if (keystore.version === 3) wallet = await Wallet.fromV3(keystore, keystorePassword)
      else return cb(new Error('Invalid keystore version'))
    } catch (e) {
      return cb(e as Error)
    }
    // Add private key
    this.addPrivateKey(Buffer.from(wallet.getPrivateKey()).toString('hex'), password, cb)
  }
}

export default RingSigner
