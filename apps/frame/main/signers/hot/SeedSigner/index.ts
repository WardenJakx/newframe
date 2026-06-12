import path from 'path'
import HotSigner from '../HotSigner'
import * as bip39 from 'bip39'
import { HDKey } from '@scure/bip32'
import { computeAddress } from 'ethers'

type Callback = (err: Error | null, result?: any) => void

// compiled (electron) forks the emitted worker.js; under jest we run from source,
// so fork the .ts worker directly — node 24 strips types natively
const WORKER_EXT = __filename.endsWith('.ts') ? 'worker.ts' : 'worker.js'
const WORKER_PATH = path.resolve(__dirname, WORKER_EXT)

class SeedSigner extends HotSigner {
  constructor(signer?: any) {
    super(signer, WORKER_PATH)
    this.encryptedSeed = signer && signer.encryptedSeed
    this.type = 'seed'
    this.model = 'phrase'
    if (this.encryptedSeed) this.update()
  }

  addSeed(seed: string, password: string, cb: Callback) {
    if (this.encryptedSeed) return cb(new Error('This signer already has a seed'))

    this._callWorker({ method: 'encryptSeed', params: { seed, password } }, (err, encryptedSeed) => {
      if (err) return cb(err)

      // Derive addresses
      const wallet = HDKey.fromMasterSeed(Buffer.from(seed, 'hex'))

      const addresses = []
      for (let i = 0; i < 100; i++) {
        const publicKey = wallet.derive("m/44'/60'/0'/0/" + i).publicKey
        const address = computeAddress('0x' + Buffer.from(publicKey!).toString('hex'))
        addresses.push(address)
      }

      // Update signer
      this.encryptedSeed = encryptedSeed
      this.addresses = addresses
      this.update()
      this.unlock(password, cb)
    })
  }

  async addPhrase(phrase: string, password: string, cb: Callback) {
    // Validate phrase
    if (!bip39.validateMnemonic(phrase)) return cb(new Error('Invalid mnemonic phrase'))
    // Get seed
    const seed = await bip39.mnemonicToSeed(phrase)
    // Add seed to signer
    this.addSeed(seed.toString('hex'), password, cb)
  }

  override save() {
    super.save({ encryptedSeed: this.encryptedSeed })
  }

  override unlock(password: string, cb: Callback) {
    super.unlock(password, { encryptedSeed: this.encryptedSeed }, cb)
  }
}

export default SeedSigner
