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
import windows from '../windows'

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

      if (signer instanceof HotSigner) {
        signer.on('lockApp', () => this.lockApp(() => {}))
      }

      // while the app is unlocked, hot signers come up unlocked
      if (signer instanceof HotSigner && signer.status === 'locked' && vault.isUnlocked()) {
        const hotSigner = signer as SeedSigner | RingSigner
        hotSigner.unlock(vault.getKey() as string, (err: Error | null) => {
          if (err) {
            log.error(`Failed to unlock signer ${hotSigner.id} with vault key`, err)
            this.lockApp(() => {})
          }
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

  private publishAppLockState() {
    try {
      windows.broadcastAction('appLockStateChanged')
    } catch (e) {
      log.debug('Unable to publish app lock state change', e)
    }
  }

  // Creating a hot signer may create or unlock the vault, in which case any
  // other locked hot signers come along for the ride
  private afterCreate(cb: Callback<Signer>): Callback<Signer> {
    return (err, signer) => {
      if (!err && vault.isUnlocked()) {
        this.hydrateHotSigners(vault.getKey() as string, undefined, (hydrateErr) => {
          if (hydrateErr) {
            log.error('Failed to hydrate hot signers after creating signer', hydrateErr)
            this.lockApp(() => {})
          } else {
            this.publishAppLockState()
          }
        })
      }
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

  addPrivateKey(id: string, privateKey: string, password: string, cb: Callback<Signer>) {
    // Get signer
    const signer = this.get(id)
    // Make sure signer is of type 'ring'
    if (signer.type !== 'ring') {
      return cb(new Error('Private keys can only be added to ring signers'), undefined)
    }

    let secret
    try {
      secret = vault.acquireKey(password)
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
      secret = vault.acquireKey(password)
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
      secret = vault.acquireKey(password)
    } catch (e) {
      return cb(e as Error, undefined)
    }

    ;(signer as RingSigner).addKeystore(keystore, keystorePassword, secret, cb)
  }

  // Hydrates every locked hot signer with the app vault key.
  private hydrateHotSigners(vaultKey: string, excludeId?: string, cb: Callback<boolean> = () => {}) {
    const lockedHotSigners = Object.values(this.signers).filter(
      (signer) => signer.id !== excludeId && signer instanceof HotSigner && signer.status === 'locked'
    ) as Array<SeedSigner | RingSigner>

    if (lockedHotSigners.length === 0) return cb(null, true)

    let remaining = lockedHotSigners.length
    let firstError: Error | null = null

    lockedHotSigners.forEach((hotSigner) => {
      hotSigner.unlock(vaultKey, (err: Error | null) => {
        if (err) {
          firstError = firstError || err
          log.error(`Failed to unlock signer ${hotSigner.id} with vault key`, err)
        }

        remaining -= 1
        if (remaining === 0) cb(firstError, firstError ? undefined : true)
      })
    })
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

    let vaultKey: string
    try {
      vaultKey = vault.unlock(password)
    } catch (e) {
      return cb(e as Error, undefined)
    }

    this.hydrateHotSigners(vaultKey, signer.id, (hydrateErr) => {
      if (hydrateErr) {
        this.lockApp(() => {})
        return cb(hydrateErr, undefined)
      }

      this.publishAppLockState()

      if (signer.status === 'ok') return exportKey()
      return (signer as SeedSigner | RingSigner).unlock(vaultKey, (err: Error | null) => {
        if (err) {
          this.lockApp(() => {})
          return cb(err, undefined)
        }
        exportKey()
      })
    })
  }

  // Unlocks the app vault and hydrates every vault-backed hot signer.
  unlockApp(password: string, cb: Callback<boolean>) {
    let vaultKey: string
    try {
      vaultKey = vault.unlock(password)
    } catch (e) {
      return cb(e as Error, undefined)
    }

    this.hydrateHotSigners(vaultKey, undefined, (err) => {
      if (err) {
        this.lockApp(() => {})
        return cb(err, undefined)
      }

      this.publishAppLockState()
      cb(null, true)
    })
  }

  unlockAppWithBiometrics(payload: BiometricUnlockPayload, cb: Callback<boolean>) {
    biometrics
      .unlock(payload)
      .then((vaultKey) => {
        vault.unlockWithKey(vaultKey)
        this.hydrateHotSigners(vaultKey, undefined, (err) => {
          if (err) {
            this.lockApp(() => {})
            return cb(err, undefined)
          }

          this.publishAppLockState()
          cb(null, true)
        })
      })
      .catch((e) => cb(e as Error, undefined))
  }

  // Locks the app vault and clears every hot signer worker secret.
  lockApp(cb: Callback<boolean>) {
    vault.lock()

    Object.values(this.signers).forEach((signer) => {
      if (signer instanceof HotSigner && signer.status !== 'locked') {
        signer.lock(() => {})
      }
    })

    this.publishAppLockState()
    cb(null, true)
  }

  unsetSigner() {
    log.info('unsetSigner')
  }
}

export default new Signers()
