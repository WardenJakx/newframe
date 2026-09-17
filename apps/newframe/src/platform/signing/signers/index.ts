import type { BiometricUnlockPayload } from '../../secrets/biometrics.js'
import type canonicalStore from '../../state-store/index.js'
import type { SignerAdapter } from './adapters.js'
import AirGapAdapter from './airgap/adapter.js'
import HotSigner from './hot/HotSigner/index.js'
import hot from './hot/index.js'
import LatticeAdapter from './lattice/adapter.js'
import LedgerAdapter from './ledger/adapter.js'
import type Signer from './Signer/index.js'
import TrezorAdapter from './trezor/adapter.js'

const createDefaultAdapters = (store: typeof canonicalStore) => [
  new LedgerAdapter(store),
  new TrezorAdapter(store),
  new LatticeAdapter(store),
  new AirGapAdapter(store)
]

interface AdapterSpec {
  [key: string]: {
    adapter: SignerAdapter
    listeners: { event: string; handler: (payload: any) => void }[]
  }
}

type Keystore = string | { version: number }
type HotSignerListeners = { lockApp: () => void; update: () => void }

export interface SignersDependencies {
  biometrics: { unlock(payload: BiometricUnlockPayload): Promise<string> }
  store: typeof canonicalStore
  vault: {
    acquireKey(password?: string): string
    exists(): boolean
    getKey(): string | null
    isUnlocked(): boolean
    lock(): void
    summary(): { exists: boolean; unlocked: boolean }
    unlock(password: string): string
    unlockWithKey(vaultKey: string): string
  }
}

export class Signers {
  private adapters: AdapterSpec = {}
  private handles: Record<string, Signer> = {}
  private hotSignerListeners = new WeakMap<HotSigner, HotSignerListeners>()
  private started = false
  private closed = false

  constructor(
    private readonly dependencies: SignersDependencies,
    registeredAdapters: SignerAdapter[] = createDefaultAdapters(dependencies.store),
    private readonly loadHotSigners: (
      signers: Signers,
      vault: SignersDependencies['vault']
    ) => void = hot.load
  ) {
    registeredAdapters.forEach((adapter) => this.addAdapter(adapter))
  }

  start() {
    if (this.started || this.closed) {
      return
    }
    this.started = true
    Object.values(this.adapters).forEach(({ adapter }) => adapter.open())
    this.loadHotSigners(this, this.dependencies.vault)
  }

  close() {
    if (this.closed) {
      return
    }
    this.closed = true
    Object.values(this.adapters).forEach(({ adapter, listeners }) => {
      listeners.forEach(({ event, handler }) => adapter.removeListener(event, handler))
      adapter.close()
    })
    Object.keys(this.handles).forEach((id) => this.detach(id)?.close())
    this.adapters = {}
  }

  addAdapter(adapter: SignerAdapter) {
    const add = this.add.bind(this)
    const remove = this.remove.bind(this)
    const update = this.update.bind(this)
    adapter.on('add', add)
    adapter.on('remove', remove)
    adapter.on('update', update)
    this.adapters[adapter.adapterType] = {
      adapter,
      listeners: [
        { event: 'add', handler: add },
        { event: 'remove', handler: remove },
        { event: 'update', handler: update }
      ]
    }
    if (this.started) {
      adapter.open()
    }
  }

  exists(id: string) {
    return id in this.handles
  }

  private attach(signer: Signer) {
    if (this.handles[signer.id]) {
      return
    }
    this.handles[signer.id] = signer
    if (signer instanceof HotSigner) {
      const listeners = {
        lockApp: () => this.lockApp(() => {}),
        update: () => this.publish(signer)
      }
      signer.on('lockApp', listeners.lockApp)
      signer.on('update', listeners.update)
      this.hotSignerListeners.set(signer, listeners)
    }
    this.publish(signer, true)
  }

  private publish(signer: Signer, isNew = false) {
    const previousId = Object.keys(this.handles).find((id) => this.handles[id] === signer)
    if (!previousId) {
      return
    }
    if (previousId !== signer.id) {
      return this.rekey(previousId, signer)
    }
    const summary = structuredClone(signer.summary())
    if (isNew) {
      this.dependencies.store.getState().newSigner(summary)
    } else {
      this.dependencies.store.getState().updateSigner(summary)
    }
  }

  private rekey(previousId: string, signer: Signer) {
    const replaced = this.handles[signer.id]
    if (replaced && replaced !== signer) {
      this.detach(signer.id, false)
      replaced.close()
    }
    delete this.handles[previousId]
    this.handles[signer.id] = signer
    this.dependencies.store.getState().rekeySigner(previousId, structuredClone(signer.summary()))
  }

  private detach(id: string, publish = true) {
    const signer = this.handles[id]
    if (!signer) {
      return
    }
    if (signer instanceof HotSigner) {
      const listeners = this.hotSignerListeners.get(signer)
      if (listeners) {
        signer.removeListener('lockApp', listeners.lockApp)
        signer.removeListener('update', listeners.update)
        this.hotSignerListeners.delete(signer)
      }
    }
    delete this.handles[id]
    if (publish) {
      this.dependencies.store.getState().removeSigner(id)
    }
    return signer
  }

  add(signer: Signer) {
    this.attach(signer)
  }

  remove(id: string) {
    const signer = this.detach(id)
    if (!signer) {
      return
    }
    if (signer instanceof HotSigner) {
      signer.close()
      signer.delete()
      return
    }
    if (signer.type in this.adapters) {
      this.adapters[signer.type].adapter.remove(signer)
    }
  }

  update(signer: Signer) {
    this.publish(signer)
  }

  reload(id: string) {
    const signer = this.handles[id]
    if (signer && !(signer instanceof HotSigner) && signer.type in this.adapters) {
      this.adapters[signer.type].adapter.reload(signer)
    }
  }

  get(id: string) {
    return this.handles[id]
  }

  private publishAppLockState() {
    const summary = this.dependencies.vault.summary()
    this.dependencies.store.getState().setAppLock({
      locked: summary.exists && !summary.unlocked,
      vaultExists: summary.exists
    })
  }

  private afterCreate(cb: Callback<Signer>): Callback<Signer> {
    return (error, signer) => {
      this.publishAppLockState()
      cb(error, signer)
    }
  }

  newPhrase(cb: Callback<string>) {
    hot.newPhrase(cb)
  }

  createFromPhrase(mnemonic: string, password: string, cb: Callback<Signer>) {
    hot.createFromPhrase(this.dependencies.vault, this, mnemonic, password, this.afterCreate(cb))
  }

  createFromPrivateKey(privateKey: string, password: string, cb: Callback<Signer>) {
    hot.createFromPrivateKey(this.dependencies.vault, this, privateKey, password, this.afterCreate(cb))
  }

  createFromKeystore(keystore: Keystore, keystorePassword: string, password: string, cb: Callback<Signer>) {
    hot.createFromKeystore(
      this.dependencies.vault,
      this,
      keystore,
      keystorePassword,
      password,
      this.afterCreate(cb)
    )
  }

  exportAccountPrivateKey(address: string, cb: Callback<{ type: string; value: string }>) {
    const normalized = (address || '').toLowerCase()
    const signer = Object.values(this.handles).find(
      (candidate) =>
        candidate instanceof HotSigner &&
        candidate.addresses.some((signerAddress) => signerAddress.toLowerCase() === normalized)
    ) as HotSigner | undefined
    if (!signer) {
      return cb(new Error('This account does not have an exportable hot signer'), undefined)
    }
    const index = signer.addresses.findIndex((signerAddress) => signerAddress.toLowerCase() === normalized)
    signer.exportPrivateKey(index, (error, value) => {
      if (error) {
        return cb(error, undefined)
      }
      cb(null, { type: 'privateKey', value: value as string })
    })
  }

  unlockApp(password: string, cb: Callback<boolean>) {
    try {
      this.dependencies.vault.unlock(password)
      this.publishAppLockState()
      cb(null, true)
    } catch (error) {
      cb(error as Error, undefined)
    }
  }

  unlockAppWithBiometrics(payload: BiometricUnlockPayload, cb: Callback<boolean>) {
    this.dependencies.biometrics
      .unlock(payload)
      .then((vaultKey) => {
        this.dependencies.vault.unlockWithKey(vaultKey)
        this.publishAppLockState()
        cb(null, true)
      })
      .catch((error: unknown) => cb(error as Error, undefined))
  }

  lockApp(cb: Callback<boolean>) {
    this.dependencies.vault.lock()
    this.publishAppLockState()
    cb(null, true)
  }
}
