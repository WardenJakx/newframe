import EventEmitter from 'events'
import log from 'electron-log'

import Signer from './Signer'
import { SignerAdapter } from './adapters'

import LedgerAdapter from './ledger/adapter'
import TrezorAdapter from './trezor/adapter'
import LatticeAdapter from './lattice/adapter'

import hot from './hot'
import RingSigner from './hot/RingSigner'
import SeedSigner from './hot/SeedSigner'
import HotSigner from './hot/HotSigner'

import store from '../store'
import vault from '../vault'
import biometrics, { type BiometricUnlockPayload } from '../biometrics'

const registeredAdapters = [new LedgerAdapter(), new TrezorAdapter(), new LatticeAdapter()]

interface AdapterSpec {
  [key: string]: {
    adapter: SignerAdapter
    listeners: {
      event: string
      handler: (p: any) => void
    }[]
  }
}

type Keystore = string | { version: number }

class Signers extends EventEmitter {
  private adapters: AdapterSpec
  private scans: { [key: string]: any }

  private signers: { [id: string]: Signer }

  constructor() {
    super()

    this.signers = {}
    this.adapters = {}

    // TODO: convert these scans to adapters
    this.scans = {
      hot: hot.scan(this)
    }

    registeredAdapters.forEach(this.addAdapter.bind(this))
  }

  close() {
    registeredAdapters.forEach((a) => a.close())
  }

  addAdapter(adapter: SignerAdapter) {
    const addFn = this.add.bind(this)
    const removeFn = this.remove.bind(this)
    const updateFn = this.update.bind(this)

    adapter.on('add', addFn)
    adapter.on('remove', removeFn)
    adapter.on('update', updateFn)

    adapter.open()

    this.adapters[adapter.adapterType] = {
      adapter,
      listeners: [
        {
          event: 'add',
          handler: addFn
        },
        {
          event: 'remove',
          handler: removeFn
        },
        {
          event: 'update',
          handler: updateFn
        }
      ]
    }
  }

  exists(id: string) {
    return id in this.signers
  }

  add(signer: Signer) {
    const id = signer.id

    if (!(id in this.signers)) {
      this.signers[id] = signer

      store.newSigner(signer.summary())

      // while the app is unlocked, vault signers come up unlocked
      const hotSigner = signer as SeedSigner | RingSigner
      if (hotSigner.encryptionVersion === 2 && hotSigner.status === 'locked' && vault.isUnlocked()) {
        hotSigner.unlock(vault.getKey() as string, (err: Error | null) => {
          if (err) log.error(`Failed to unlock signer ${hotSigner.id} with vault key`, err)
        })
      }
    }
  }

  remove(id: string) {
    const signer = this.signers[id]

    if (signer) {
      delete this.signers[id]
      store.removeSigner(id)
      store.navClearSigner(id)

      const type = signer.type === 'ring' || signer.type === 'seed' ? 'hot' : signer.type

      if (type in this.adapters) {
        this.adapters[type].adapter.remove(signer)
      } else {
        // backwards compatibility
        signer.close()
        signer.delete()
      }
    }
  }

  update(signer: Signer) {
    const id = signer.id

    if (id in this.signers) {
      this.signers[id] = signer

      store.updateSigner(signer.summary())
    } else {
      this.add(signer)
    }
  }

  reload(id: string) {
    const signer = this.signers[id]

    if (signer) {
      const type = signer.type === 'ring' || signer.type === 'seed' ? 'hot' : signer.type

      if (this.scans[type] && typeof this.scans[type] === 'function') {
        signer.close()
        delete this.signers[id]

        this.scans[type]()
      } else if (type in this.adapters) {
        this.adapters[type].adapter.reload(signer)
      }
    }
  }

  get(id: string) {
    return this.signers[id]
  }

  // Creating a hot signer may create or unlock the vault, in which case any
  // other locked vault signers come along for the ride
  private afterCreate(cb: Callback<Signer>): Callback<Signer> {
    return (err, signer) => {
      if (!err && vault.isUnlocked()) this.unlockVaultSigners(vault.getKey() as string)
      cb(err, signer)
    }
  }

  newPhrase(cb: Callback<string>) {
    hot.newPhrase(cb)
  }

  createFromPhrase(mnemonic: string, password: string, cb: Callback<Signer>) {
    hot.createFromPhrase(this, mnemonic, password, this.afterCreate(cb))
  }

  createFromPrivateKey(privateKey: string, password: string, cb: Callback<Signer>) {
    hot.createFromPrivateKey(this, privateKey, password, this.afterCreate(cb))
  }

  createFromKeystore(keystore: Keystore, keystorePassword: string, password: string, cb: Callback<Signer>) {
    hot.createFromKeystore(this, keystore, keystorePassword, password, this.afterCreate(cb))
  }

  // Resolves the secret used to encrypt a hot signer's payload. Vault
  // signers (encryptionVersion 2) use the vault key — the password, if
  // provided, is the master password used to unlock the vault. Legacy
  // signers still use their own password directly
  private resolveSignerSecret(signer: HotSigner, password: string): string {
    if (signer.encryptionVersion === 2) return vault.acquireKey(password)
    return password
  }

  // After a legacy signer is unlocked with its own password, re-encrypt it
  // under the vault key so future unlocks use the master password
  private migrateLegacySigner(signer: HotSigner, password: string) {
    let vaultKey: string

    try {
      // The signer's password becomes the vault master password if no
      // vault exists yet. If a locked vault exists, only migrate when the
      // passwords match — otherwise leave the signer as legacy for now
      vaultKey = vault.acquireKey(password)
    } catch (e) {
      log.warn(`Not migrating legacy signer ${signer.id} to vault`, e)
      return
    }

    ;(signer as SeedSigner | RingSigner).reencrypt(password, vaultKey, (err: Error | null) => {
      if (err) return log.error(`Failed to migrate legacy signer ${signer.id} to vault`, err)
      log.info(`Migrated legacy signer ${signer.id} to vault encryption`)
    })
  }

  addPrivateKey(id: string, privateKey: string, password: string, cb: Callback<Signer>) {
    // Get signer
    const signer = this.get(id)
    // Make sure signer is of type 'ring'
    if (signer.type !== 'ring') {
      return cb(new Error('Private keys can only be added to ring signers'), undefined)
    }

    let secret
    try {
      secret = this.resolveSignerSecret(signer as RingSigner, password)
    } catch (e) {
      return cb(e as Error, undefined)
    }

    // Add private key
    ;(signer as RingSigner).addPrivateKey(privateKey, secret, cb)
  }

  removePrivateKey(id: string, index: number, password: string, cb: Callback<Signer>) {
    // Get signer
    const signer = this.get(id)

    if (signer.type !== 'ring') {
      return cb(new Error('Private keys can only be removed from ring signers'), undefined)
    }

    let secret
    try {
      secret = this.resolveSignerSecret(signer as RingSigner, password)
    } catch (e) {
      return cb(e as Error, undefined)
    }

    ;(signer as RingSigner).removePrivateKey(index, secret, cb)
  }

  addKeystore(
    id: string,
    keystore: Keystore,
    keystorePassword: string,
    password: string,
    cb: Callback<Signer>
  ) {
    // Get signer
    const signer = this.get(id)

    if (signer.type !== 'ring') {
      return cb(new Error('Keystores can only be used with ring signers'), undefined)
    }

    let secret
    try {
      secret = this.resolveSignerSecret(signer as RingSigner, password)
    } catch (e) {
      return cb(e as Error, undefined)
    }

    ;(signer as RingSigner).addKeystore(keystore, keystorePassword, secret, cb)
  }

  // Unlocks every locked vault signer with the vault key
  private unlockVaultSigners(vaultKey: string, excludeId?: string) {
    Object.values(this.signers).forEach((signer) => {
      if (signer.id === excludeId) return
      const hotSigner = signer as SeedSigner | RingSigner
      if (hotSigner.encryptionVersion === 2 && hotSigner.status === 'locked' && hotSigner.unlock) {
        hotSigner.unlock(vaultKey, (err: Error | null) => {
          if (err) log.error(`Failed to unlock signer ${hotSigner.id} with vault key`, err)
        })
      }
    })
  }

  // Locking is app-wide: locks the vault and every hot signer
  lock(id: string, cb: Callback<Signer>) {
    vault.lock()

    let calledBack = false

    Object.values(this.signers).forEach((signer) => {
      if (signer instanceof HotSigner && signer.status !== 'locked') {
        const isTarget = signer.id === id
        if (isTarget) calledBack = true
        signer.lock(isTarget ? (cb as any) : () => {})
      }
    })

    // target signer was already locked or isn't a hot signer
    if (!calledBack) cb(null, undefined)
  }

  // Unlocking is app-wide: the password unlocks the vault session and with
  // it every vault signer. Legacy signers unlock with their own password
  // and migrate to the vault
  unlock(id: string, password: string, cb: Callback<Signer>) {
    const signer = this.signers[id]

    // @ts-ignore
    if (signer && signer.unlock) {
      const hotSigner = signer as SeedSigner | RingSigner

      if (hotSigner.encryptionVersion === 2) {
        let vaultKey: string
        try {
          vaultKey = vault.acquireKey(password)
        } catch (e) {
          return cb(e as Error, undefined)
        }
        hotSigner.unlock(vaultKey, cb)
        this.unlockVaultSigners(vaultKey, hotSigner.id)
      } else {
        // legacy signer encrypted directly with its own password
        hotSigner.unlock(password, (err: Error | null) => {
          if (err) return cb(err, undefined)
          this.migrateLegacySigner(hotSigner, password)
          // migration may have created or unlocked the vault
          if (vault.isUnlocked()) this.unlockVaultSigners(vault.getKey() as string, hotSigner.id)
          cb(null, undefined)
        })
      }
    } else {
      log.error('Signer not unlockable via password, no unlock method')
    }
  }

  exportAccountPrivateKey(address: string, password: string, cb: Callback<{ type: string; value: string }>) {
    const normalized = (address || '').toLowerCase()
    const signer = Object.values(this.signers).find(
      (signer) =>
        signer instanceof HotSigner &&
        signer.addresses.some((signerAddress) => signerAddress.toLowerCase() === normalized)
    ) as HotSigner | undefined

    if (!signer) return cb(new Error('This account does not have an exportable hot signer'), undefined)
    if (!password) return cb(new Error('Password required'), undefined)

    const index = signer.addresses.findIndex((signerAddress) => signerAddress.toLowerCase() === normalized)
    if (index === -1) return cb(new Error('Account address was not found on this signer'), undefined)

    const exportKey = () =>
      signer.exportPrivateKey(index, (err, value) => {
        if (err) return cb(err, undefined)
        cb(null, { type: 'privateKey', value: value as string })
      })

    if (signer.encryptionVersion === 2) {
      let vaultKey: string
      try {
        vaultKey = vault.unlock(password)
      } catch (e) {
        return cb(e as Error, undefined)
      }

      this.unlockVaultSigners(vaultKey, signer.id)

      if (signer.status === 'ok') return exportKey()
      return (signer as SeedSigner | RingSigner).unlock(vaultKey, (err: Error | null) => {
        if (err) return cb(err, undefined)
        exportKey()
      })
    }

    ;(signer as SeedSigner | RingSigner).unlock(password, (err: Error | null) => {
      if (err) return cb(err, undefined)
      this.migrateLegacySigner(signer, password)
      exportKey()
    })
  }

  // Unlocks the vault and every hot signer encrypted with it
  unlockVault(password: string, cb: Callback<boolean>) {
    let vaultKey: string
    try {
      vaultKey = vault.unlock(password)
    } catch (e) {
      return cb(e as Error, undefined)
    }

    this.unlockVaultSigners(vaultKey)

    cb(null, true)
  }

  unlockVaultWithBiometrics(payload: BiometricUnlockPayload, cb: Callback<boolean>) {
    biometrics
      .unlock(payload)
      .then((vaultKey) => {
        vault.unlockWithKey(vaultKey)
        this.unlockVaultSigners(vaultKey)
        cb(null, true)
      })
      .catch((e) => cb(e as Error, undefined))
  }

  // Locks the vault and every hot signer
  lockVault(cb: Callback<boolean>) {
    vault.lock()

    Object.values(this.signers).forEach((signer) => {
      if (signer instanceof HotSigner && signer.status !== 'locked') {
        signer.lock(() => {})
      }
    })

    cb(null, true)
  }

  unsetSigner() {
    log.info('unsetSigner')
  }
}

export default new Signers()
