import log from 'electron-log'

import { SignerAdapter } from '../adapters'
import store from '../../store'
import Lattice from './Lattice'
import { Derivation } from '../Signer/derive'

interface GlobalLatticeSettings {
  baseUrl: string
  accountLimit: number
  derivation: Derivation
}

interface LatticeSettings extends GlobalLatticeSettings {
  deviceName: string
  tag: string
  privKey: string
  paired: boolean
}

function getLatticeSettings(deviceId: string): LatticeSettings {
  const { baseUrl, derivation, accountLimit } = getGlobalLatticeSettings()
  const device = store.getState().main.lattice[deviceId]

  return { ...device, baseUrl, derivation, accountLimit }
}

function getGlobalLatticeSettings(): GlobalLatticeSettings {
  const accountLimit = store.getState().main.latticeSettings.accountLimit
  const derivation = store.getState().main.latticeSettings.derivation
  const endpointMode = store.getState().main.latticeSettings.endpointMode
  const baseUrl =
    endpointMode === 'custom'
      ? store.getState().main.latticeSettings.endpointCustom
      : 'https://signing.gridpl.us'

  return { baseUrl, derivation, accountLimit }
}

export default class LatticeAdapter extends SignerAdapter {
  private knownSigners: { [deviceId: string]: Lattice }

  private unsubscribeSigners?: () => void
  private unsubscribeSettings?: () => void

  constructor() {
    super('lattice')

    this.knownSigners = {}
  }

  override open() {
    this.unsubscribeSettings?.()
    this.unsubscribeSettings = store.subscribe(
      (state) => state.main.latticeSettings,
      () => {
        const { baseUrl, derivation, accountLimit } = getGlobalLatticeSettings()

        Object.values(this.knownSigners).forEach((lattice) => {
          if (!lattice.connection) return

          let needsUpdate = false,
            reloadAddresses = false

          if (derivation !== lattice.derivation) {
            lattice.derivation = derivation
            lattice.addresses = []

            reloadAddresses = true
          }

          if (accountLimit !== lattice.accountLimit) {
            lattice.accountLimit = accountLimit

            reloadAddresses = reloadAddresses || lattice.addresses.length < lattice.accountLimit
            needsUpdate = true
          }
          if (baseUrl !== lattice.connection.baseUrl) {
            // if any connection settings have changed, re-connect
            this.reload(lattice)
          } else if (reloadAddresses) {
            lattice.deriveAddresses()
          } else if (needsUpdate) {
            this.emit('update', lattice)
          }
        })
      },
      { fireImmediately: true }
    )

    this.unsubscribeSigners?.()
    this.unsubscribeSigners = store.subscribe(
      (state) => state.main.lattice as { [id: string]: LatticeSettings },
      (devices) => {
        Object.entries(devices).forEach(([deviceId, device]) => {
          if (deviceId in this.knownSigners) return

          log.info('Initializing Lattice device', { deviceId })

          const { deviceName, tag, baseUrl, privKey, accountLimit } = getLatticeSettings(deviceId)

          const lattice = new Lattice(deviceId, deviceName, tag)
          lattice.accountLimit = accountLimit

          const emitUpdate = () => this.emit('update', lattice)

          lattice.on('update', emitUpdate)

          lattice.on('connect', (paired: boolean) => {
            store.getState().updateLattice(deviceId, { paired })

            if (paired) {
              // Lattice recognizes the private key and remembers if this
              // client is already paired between sessions
              const { derivation } = getLatticeSettings(deviceId)

              lattice.deriveAddresses(derivation)
            }
          })

          lattice.on('paired', (hasActiveWallet: boolean) => {
            store.getState().updateLattice(deviceId, { paired: true })

            if (hasActiveWallet) {
              const { derivation } = getLatticeSettings(deviceId)
              lattice.deriveAddresses(derivation)
            }
          })

          lattice.on('error', () => {
            if (lattice.connection && !lattice.connection.isPaired) {
              store.getState().updateLattice(deviceId, { paired: false })
            }

            lattice.disconnect()

            emitUpdate()
          })

          lattice.on('close', () => {
            delete this.knownSigners[deviceId]

            this.emit('remove', lattice.id)
          })

          this.knownSigners[deviceId] = lattice
          this.emit('add', lattice)

          if (device.paired) {
            // don't attempt to automatically connect if the Lattice isn't
            // paired as this could happen without the user noticing
            lattice.connect(baseUrl, privKey).catch(() => {
              store.getState().updateLattice(deviceId, { paired: false })
            })
          }
        })
      },
      { fireImmediately: true }
    )
  }

  override close() {
    this.unsubscribeSigners?.()
    this.unsubscribeSigners = undefined
    this.unsubscribeSettings?.()
    this.unsubscribeSettings = undefined

    this.knownSigners = {}
  }

  override remove(lattice: Lattice) {
    log.info(`removing Lattice ${lattice.deviceId}`)

    store.getState().removeLattice(lattice.deviceId)

    if (lattice.deviceId in this.knownSigners) {
      lattice.close()
    }
  }

  override async reload(lattice: Lattice) {
    log.info(`reloading Lattice ${lattice.deviceId}`)

    lattice.disconnect()

    const { baseUrl, privKey } = getLatticeSettings(lattice.deviceId)

    try {
      await lattice.connect(baseUrl, privKey)
    } catch (e) {
      log.error('could not reload Lattice', e)
    }
  }
}
