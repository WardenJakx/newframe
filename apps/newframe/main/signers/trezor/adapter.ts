import log from 'electron-log'

import type { DeviceUniquePath, Device as TrezorDevice } from '@trezor/connect'

import { SignerAdapter } from '../adapters.js'
import Trezor, { Status } from './Trezor.js'
import type canonicalStore from '../../store/index.js'
import TrezorBridge from './bridge.js'

interface KnownSigners {
  [id: string]: {
    signer: Trezor
    eventHandlers: {
      [event: string]: (...args: any) => void
    }
  }
}

export default class TrezorSignerAdapter extends SignerAdapter {
  private knownSigners: KnownSigners = {}
  private unsubscribeDerivation?: () => void
  private initializationTimeouts = new Map<string, ReturnType<typeof setTimeout>>()
  private derivationTimeouts = new Set<ReturnType<typeof setTimeout>>()
  private opened = false

  constructor(
    private readonly store: typeof canonicalStore,
    private readonly bridge: typeof TrezorBridge = TrezorBridge
  ) {
    super('trezor')
  }

  override open() {
    if (this.opened) return
    this.opened = true

    this.unsubscribeDerivation?.()
    this.unsubscribeDerivation = this.store.subscribe(
      (state) => state.main.trezor.derivation,
      (trezorDerivation) => {
        Object.values(this.knownSigners).forEach((signerInfo) => {
          const trezor = signerInfo.signer
          if (trezor.derivation !== trezorDerivation) {
            trezor.derivation = trezorDerivation

            if (trezor.status === Status.OK) {
              trezor.deriveAddresses()
            }
          }
        })
      },
      { fireImmediately: true }
    )

    this.bridge.on('trezor:detected', (path: string) => {
      // create a new signer whenever a Trezor is detected, but it won't be opened
      // until a connect event with an active device is received
      const id = Trezor.generateId(path)

      if (!this.knownSigners[id]) {
        this.initTrezor(path)
      }
    })

    this.bridge.on('trezor:connect', async (device: TrezorDevice) => {
      const id = Trezor.generateId(device.path)
      const trezor = this.knownSigners[id]?.signer || this.initTrezor(device.path)

      trezor.derivation = this.store.getState().main.trezor.derivation

      try {
        await trezor.open(device)

        const version = [trezor.appVersion.major, trezor.appVersion.minor, trezor.appVersion.patch].join('.')
        log.info(`Trezor ${trezor.id} connected: ${trezor.model}, firmware v${version}`)

        // arbitrary delay to attempt to minimize message conflicts on first connection
        if (!this.opened) return
        const derivationTimeout = setTimeout(() => {
          this.derivationTimeouts.delete(derivationTimeout)
          if (this.opened) trezor.deriveAddresses()
        }, 200)
        this.derivationTimeouts.add(derivationTimeout)
      } catch (e) {
        log.error('could not open Trezor', e)
      }
    })

    this.bridge.on('trezor:disconnect', (device: TrezorDevice) => {
      this.withSigner(device, (signer) => {
        log.info(`Trezor ${signer.id} disconnected`)

        this.remove(signer)
      })
    })

    this.bridge.on('trezor:update', (device: TrezorDevice) => {
      this.withSigner(device, (signer) => {
        log.debug(`Trezor ${signer.id} updated`)

        signer.device = device
      })
    })

    this.bridge.on('trezor:entered:pin', (deviceId: string) => {
      log.verbose(`Trezor ${deviceId} pin entered`)

      this.handleEvent(deviceId, 'trezor:entered:pin')
    })

    this.bridge.on('trezor:entered:passphrase', (deviceId: string) => {
      log.verbose(`Trezor ${deviceId} passphrase entered`)

      this.handleEvent(deviceId, 'trezor:entered:passphrase')
    })

    this.bridge.on('trezor:enteringPhrase', (deviceId: string) => {
      log.verbose(`Trezor ${deviceId} waiting for passphrase entry on device`)
      const signer = this.knownSigners[deviceId].signer

      // const currentStatus = signer.status

      // this.addEventHandler(signer, 'trezor:entered:passphrase', () => {
      //   signer.status = currentStatus
      //   this.emit('update', signer)
      // })

      signer.status = Status.ENTERING_PASSPHRASE
      this.emit('update', signer)
    })

    this.bridge.on('trezor:needPin', (device: TrezorDevice) => {
      this.withSigner(device, (signer) => {
        log.verbose(`Trezor ${signer.id} needs pin`)

        const currentStatus = signer.status

        this.addEventHandler(signer, 'trezor:entered:pin', () => {
          signer.status = currentStatus
          this.emit('update', signer)
        })

        signer.status = Status.NEEDS_PIN
        this.emit('update', signer)
      })
    })

    this.bridge.on('trezor:needPhrase', (device: TrezorDevice) => {
      this.withSigner(device, (signer) => {
        log.verbose(`Trezor ${signer.id} needs passphrase`, { status: signer.status })

        const currentStatus = signer.status

        this.addEventHandler(signer, 'trezor:entered:passphrase', () => {
          signer.status = currentStatus
          this.emit('update', signer)
        })

        signer.status = Status.NEEDS_PASSPHRASE
        this.emit('update', signer)
      })
    })

    this.bridge.open()
    super.open()
  }

  private initTrezor(path: string) {
    const trezor = new Trezor(path)

    log.info(`Trezor ${trezor.id} detected`)

    trezor.on('close', () => {
      this.emit('remove', trezor.id)
    })

    trezor.on('update', () => {
      this.emit('update', trezor)
    })

    this.knownSigners[trezor.id] = { signer: trezor, eventHandlers: {} }

    this.emit('add', trezor)

    this.store.getState().navHome({
      view: 'accounts',
      data: { showAddAccounts: true, newAccountType: 'trezor', selectedSigner: trezor.id }
    })

    const initializationTimeout = setTimeout(() => {
      this.initializationTimeouts.delete(trezor.id)
      if (trezor.status === Status.INITIAL && !trezor.device) {
        // if the trezor hasn't connected in a reasonable amount of time, consider it disconnected
        trezor.status = Status.DISCONNECTED
        this.emit('update', trezor)
      }
    }, 10_000)
    this.initializationTimeouts.set(trezor.id, initializationTimeout)

    return trezor
  }

  override close() {
    if (!this.opened) return
    this.opened = false

    this.unsubscribeDerivation?.()
    this.unsubscribeDerivation = undefined

    this.initializationTimeouts.forEach((timeout) => clearTimeout(timeout))
    this.initializationTimeouts.clear()
    this.derivationTimeouts.forEach((timeout) => clearTimeout(timeout))
    this.derivationTimeouts.clear()

    this.bridge.close()

    super.close()
  }

  override remove(trezor: Trezor) {
    const initializationTimeout = this.initializationTimeouts.get(trezor.id)
    if (initializationTimeout) clearTimeout(initializationTimeout)
    this.initializationTimeouts.delete(trezor.id)

    if (trezor.id in this.knownSigners) {
      log.info(`removing Trezor ${trezor.id}`)

      delete this.knownSigners[trezor.id]

      trezor.close()
    }
  }

  override reload(trezor: Trezor) {
    log.info(`reloading Trezor ${trezor.id}`)

    trezor.status = Status.INITIAL
    this.emit('update', trezor)

    if (trezor.device) {
      // this Trezor is already open, just reset and derive addresses again
      trezor.open(trezor.device).then(() => trezor.deriveAddresses())
    } else {
      // this Trezor is not open because it was never connected,
      // attempt to force a reload by calling this method
      this.bridge.getFeatures({ device: { path: trezor.path as DeviceUniquePath } })
    }
  }

  private addEventHandler(signer: Trezor, event: string, handler: (device: TrezorDevice) => void) {
    this.knownSigners[signer.id].eventHandlers[event] = handler
  }

  private handleEvent(signerId: string, event: string, ...args: any) {
    const action = this.knownSigners[signerId]?.eventHandlers[event] || (() => {})

    delete this.knownSigners[signerId].eventHandlers[event]

    action(args)
  }

  private withSigner(device: TrezorDevice, fn: (signer: Trezor) => void) {
    const signer = this.knownSigners[Trezor.generateId(device.path)]?.signer

    if (signer) fn(signer)
  }
}
