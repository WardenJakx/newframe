import { HDKey } from '@scure/bip32'
import HotSignerWorker from '../HotSigner/worker.ts'
import type { PseudoCallback, WorkerRPCMessage } from '../HotSigner/worker.ts'

class SeedSignerWorker extends HotSignerWorker {
  seed: string | null

  constructor() {
    super()
    this.seed = null
    process.on('message', (message: WorkerRPCMessage) => this.handleMessage(message))
  }

  unlock(
    { encryptedSeed, password }: { encryptedSeed: string; password: string },
    pseudoCallback: PseudoCallback
  ) {
    try {
      this.seed = this._decrypt(encryptedSeed, password)
      pseudoCallback(null)
    } catch (e) {
      pseudoCallback('Invalid password')
    }
  }

  lock(_: any, pseudoCallback: PseudoCallback) {
    this.seed = null
    pseudoCallback(null)
  }

  encryptSeed({ seed, password }: { seed: any; password: string }, pseudoCallback: PseudoCallback) {
    pseudoCallback(null, this._encrypt(seed.toString('hex'), password))
  }

  override signMessage({ index, message }: any, pseudoCallback: PseudoCallback) {
    // Make sure signer is unlocked
    if (!this.seed) return pseudoCallback('Signer locked')
    // Derive private key
    const key = this._derivePrivateKey(index)
    // Sign message
    super.signMessage(key, message, pseudoCallback)
  }

  override signTypedData({ index, typedMessage }: any, pseudoCallback: PseudoCallback) {
    // Make sure signer is unlocked
    if (!this.seed) return pseudoCallback('Signer locked')
    // Derive private key
    const key = this._derivePrivateKey(index)
    // Sign message
    super.signTypedData(key, typedMessage, pseudoCallback)
  }

  override signTransaction({ index, rawTx }: any, pseudoCallback: PseudoCallback) {
    // Make sure signer is unlocked
    if (!this.seed) return pseudoCallback('Signer locked')
    // Derive private key
    const key = this._derivePrivateKey(index)
    // Sign transaction
    super.signTransaction(key, rawTx, pseudoCallback)
  }

  exportPrivateKey({ index }: { index: number }, pseudoCallback: PseudoCallback) {
    if (!this.seed) return pseudoCallback('Signer locked')

    try {
      pseudoCallback(null, '0x' + this._derivePrivateKey(index).toString('hex'))
    } catch (e) {
      pseudoCallback('Unable to export private key')
    }
  }

  _derivePrivateKey(index: number) {
    const key = HDKey.fromMasterSeed(Buffer.from(this.seed!, 'hex')).derive("m/44'/60'/0'/0/" + index)
    return Buffer.from(key.privateKey!)
  }
}

const seedSignerWorker = new SeedSignerWorker() // eslint-disable-line
