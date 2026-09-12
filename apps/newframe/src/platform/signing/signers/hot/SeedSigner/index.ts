import { stripHexPrefix } from '@ethereumjs/util'
import { HDKey } from '@scure/bip32'
import { computeAddress, Mnemonic } from 'ethers'

import HotSigner, { type VaultAccess } from '../HotSigner/index.js'
import { openSecret, sealSecret, type EncryptedSecret } from '../secret.js'

class SeedSigner extends HotSigner {
  encryptedSeed?: EncryptedSecret

  constructor(
    signer:
      | { id?: string; addresses?: string[]; network?: string; encryptedSeed?: EncryptedSecret }
      | undefined,
    vault: VaultAccess
  ) {
    super(signer, vault)
    this.encryptedSeed = signer?.encryptedSeed
    this.type = 'seed'
    this.model = 'phrase'
  }

  addSeed(seed: string, vaultKeyHex: string, cb: Callback<SeedSigner>) {
    if (this.encryptedSeed) return cb(new Error('This signer already has a seed'), undefined)

    const seedBuffer = Buffer.from(seed, 'hex')
    let root: HDKey | undefined
    try {
      root = HDKey.fromMasterSeed(seedBuffer)
      const addresses: string[] = []
      for (let index = 0; index < 100; index++) {
        const child = root.derive(`m/44'/60'/0'/0/${index}`)
        try {
          const publicKey = child.publicKey
          if (!publicKey) throw new Error('Unable to derive public key')
          addresses.push(computeAddress(`0x${Buffer.from(publicKey).toString('hex')}`))
        } finally {
          child.wipePrivateData()
        }
      }

      this.encryptedSeed = sealSecret(seedBuffer, vaultKeyHex)
      this.addresses = addresses
      this.update()
      cb(null, this)
    } catch (error) {
      cb(error as Error, undefined)
    } finally {
      root?.wipePrivateData()
      seedBuffer.fill(0)
    }
  }

  addPhrase(phrase: string, vaultKeyHex: string, cb: Callback<SeedSigner>) {
    if (!Mnemonic.isValidMnemonic(phrase)) return cb(new Error('Invalid mnemonic phrase'), undefined)
    this.addSeed(stripHexPrefix(Mnemonic.fromPhrase(phrase).computeSeed()), vaultKeyHex, cb)
  }

  protected override persistedSecret() {
    return { encryptedSeed: this.encryptedSeed }
  }

  protected override openPrivateKey(index: number, vaultKeyHex: string) {
    if (!this.encryptedSeed) throw new Error('Seed not found')
    const seed = openSecret(this.encryptedSeed, vaultKeyHex)
    let root: HDKey | undefined
    let child: HDKey | undefined
    try {
      root = HDKey.fromMasterSeed(seed)
      child = root.derive(`m/44'/60'/0'/0/${index}`)
      const privateKey = child.privateKey
      if (!privateKey) throw new Error('Private key not found')
      return Buffer.from(privateKey)
    } finally {
      child?.wipePrivateData()
      root?.wipePrivateData()
      seed.fill(0)
    }
  }
}

export default SeedSigner
