import { Subscription } from '@ledgerhq/hw-transport'
import log from 'electron-log'
// type-only: at runtime node-hid is used solely inside the Ledger transports
import type { Device } from 'node-hid'
import { shallow } from 'zustand/vanilla/shallow'

import type canonicalStore from '../../../state-store/index.js'
import { SignerAdapter } from '../adapters.js'
import { Derivation } from '../Signer/derive.js'
import { getLedgerDevices, TransportNodeHidSingleton as TransportNodeHid } from './dependencies.js'
import Ledger, { Status } from './Ledger/index.js'

function updateDerivation(
  store: typeof canonicalStore,
  ledger: Ledger,
  derivation = store.getState().main.ledger.derivation,
  accountLimit = 0
) {
  const liveAccountLimit =
    accountLimit || (derivation === Derivation.live ? store.getState().main.ledger.liveAccountLimit : 0)

  ledger.derivation = derivation
  ledger.accountLimit = liveAccountLimit
}

interface Disconnection {
  device: Ledger
  timeout: NodeJS.Timeout
}

type ConnectedDevice = Device & { path: string; product: string }

export default class LedgerSignerAdapter extends SignerAdapter {
  private knownSigners: { [devicePath: string]: Ledger }
  private disconnections: Disconnection[]

  private unsubscribeDerivation?: () => void
  private usbListener: Subscription | null = null
  private opened = false
  private reconnectTimers = new Map<Ledger, NodeJS.Timeout>()
  private reconnectDelays = new Map<Ledger, number>()
  private connecting = new Map<Ledger, Promise<void>>()

  constructor(private readonly store: typeof canonicalStore) {
    super('ledger')

    this.knownSigners = {}
    this.disconnections = []
  }

  override open() {
    if (this.opened) return
    this.opened = true

    this.unsubscribeDerivation?.()
    this.unsubscribeDerivation = this.store.subscribe(
      (state) => [state.main.ledger.derivation, state.main.ledger.liveAccountLimit] as const,
      ([ledgerDerivation, liveAccountLimit]) => {
        Object.values(this.knownSigners).forEach((ledger) => {
          if (
            ledger.derivation !== ledgerDerivation ||
            (ledger.derivation === 'live' && ledger.accountLimit !== liveAccountLimit)
          ) {
            updateDerivation(this.store, ledger, ledgerDerivation, liveAccountLimit)
            ledger.deriveAddresses()
          }
        })
      },
      { equalityFn: shallow, fireImmediately: true }
    )

    this.usbListener = TransportNodeHid.listen({
      next: (evt) => {
        log.debug(`received ${evt.type} USB event`)

        if (!evt.deviceModel) {
          log.warn('received USB event with no Ledger device model', evt)
          return
        }

        this.handleDeviceChanges()
      },
      complete: () => {
        log.debug('received USB complete event')
      },
      error: (err) => {
        log.error('USB error', err)
      }
    })

    super.open()
  }

  override close() {
    if (!this.opened) return
    this.opened = false
    this.reconnectTimers.forEach(clearTimeout)
    this.reconnectTimers.clear()
    this.reconnectDelays.clear()

    this.unsubscribeDerivation?.()
    this.unsubscribeDerivation = undefined

    if (this.usbListener) {
      this.usbListener.unsubscribe()
      this.usbListener = null
    }

    this.disconnections.forEach(({ timeout }) => clearTimeout(timeout))
    this.disconnections = []

    super.close()
  }

  override remove(ledger: Ledger) {
    if (ledger.devicePath in this.knownSigners) {
      log.info(`removing Ledger ${ledger.model} attached at ${ledger.devicePath}`)

      delete this.knownSigners[ledger.devicePath]
      this.resetReconnect(ledger)

      ledger.close()
    }
  }

  override reload(ledger: Ledger) {
    log.info(`reloading  Ledger ${ledger.model} attached at ${ledger.devicePath}`)

    const signer = this.knownSigners[ledger.devicePath]

    if (signer) {
      this.resetReconnect(signer)
      void this.handleConnectedDevice(signer)
    }
  }

  private handleDeviceChanges() {
    const { attachedDevices, detachedLedgers, reconnections, pendingDisconnections } =
      this.detectDeviceChanges()

    this.disconnections = pendingDisconnections

    detachedLedgers.forEach((ledger) => this.handleDisconnectedDevice(ledger))
    reconnections.forEach((disconnection) => this.handleReconnectedDevice(disconnection))
    attachedDevices.forEach((device) => this.handleAttachedDevice(device))
  }

  private async handleAttachedDevice(device: ConnectedDevice) {
    log.info(`Ledger ${device.product} attached at ${device.path}`)

    const ledger = new Ledger(device.path, device.product)

    const emitUpdate = () => {
      this.emit('update', ledger)
      this.scheduleReconnect(ledger)
    }

    ledger.on('update', emitUpdate)
    ledger.on('error', emitUpdate)
    ledger.on('lock', emitUpdate)

    ledger.on('close', () => {
      this.emit('remove', ledger.id)
    })

    ledger.on('unlock', () => {
      ledger.connect()
    })

    this.knownSigners[ledger.devicePath] = ledger

    this.emit('add', ledger)

    updateDerivation(this.store, ledger)
    await this.handleConnectedDevice(ledger)
  }

  private handleConnectedDevice(ledger: Ledger) {
    if (!this.opened) return
    const pending = this.connecting.get(ledger)
    if (pending) return pending
    const connection = this.connectDevice(ledger).finally(() => {
      this.connecting.delete(ledger)
      this.scheduleReconnect(ledger)
    })
    this.connecting.set(ledger, connection)
    return connection
  }

  private resetReconnect(ledger: Ledger) {
    clearTimeout(this.reconnectTimers.get(ledger))
    this.reconnectTimers.delete(ledger)
    this.reconnectDelays.delete(ledger)
  }

  private scheduleReconnect(ledger: Ledger) {
    if (ledger.status === Status.OK) {
      this.resetReconnect(ledger)
      return
    }
    if (
      !this.opened ||
      this.knownSigners[ledger.devicePath] !== ledger ||
      this.disconnections.some(({ device }) => device === ledger) ||
      this.connecting.has(ledger) ||
      this.reconnectTimers.has(ledger) ||
      ![Status.WRONG_APP, Status.NEEDS_RECONNECTION].includes(ledger.status)
    )
      return

    // A failed handshake may not produce another USB event. Back off per device.
    const delay = this.reconnectDelays.get(ledger) ?? 2000
    this.reconnectDelays.set(ledger, Math.min(delay * 2, 60_000))
    this.reconnectTimers.set(
      ledger,
      setTimeout(() => {
        this.reconnectTimers.delete(ledger)
        void this.handleConnectedDevice(ledger)
      }, delay)
    )
  }

  private async connectDevice(ledger: Ledger) {
    const isAttached = () =>
      this.opened &&
      this.knownSigners[ledger.devicePath] === ledger &&
      !this.disconnections.some(({ device }) => device === ledger)

    try {
      await ledger.disconnect()
      if (!isAttached()) return
      await ledger.open()
      if (!isAttached()) {
        await ledger.disconnect()
        return
      }
      await ledger.connect()
    } catch (error) {
      log.warn(`Could not connect Ledger ${ledger.model}`, error)
      if (isAttached()) {
        ledger.updateStatus(Status.NEEDS_RECONNECTION)
        this.emit('update', ledger)
      }
    }
  }

  private async handleReconnectedDevice(disconnection: Disconnection) {
    log.info(`Ledger ${disconnection.device.model} re-connected at ${disconnection.device.devicePath}`)

    clearTimeout(disconnection.timeout)

    await this.connecting.get(disconnection.device)
    this.resetReconnect(disconnection.device)
    updateDerivation(this.store, disconnection.device)
    await this.handleConnectedDevice(disconnection.device)
  }

  handleDisconnectedDevice(ledger: Ledger) {
    log.info(`Ledger ${ledger.model} disconnected from ${ledger.devicePath}`)
    this.resetReconnect(ledger)

    ledger.disconnect()

    // when a user exits the eth app, it takes a few seconds for the
    // main ledger to reconnect via USB, so attempt to wait for this event
    // instead of immediately removing the signer
    this.disconnections.push({
      device: ledger,
      timeout: setTimeout(() => {
        const index = this.disconnections.findIndex((d) => d.device.devicePath === ledger.devicePath)
        this.disconnections.splice(index, 1)

        log.info(`Ledger ${ledger.model} detached from ${ledger.devicePath}`)

        this.remove(ledger)
      }, 5000)
    })
  }

  private detectDeviceChanges() {
    // all Ledger devices that are currently connected
    const ledgerDevices = getLedgerDevices()
      .filter((device) => !!device.path)
      .map((d) => ({ ...d, path: d.path as string, product: d.product || '' }))

    const { pendingDisconnections, reconnections } = this.getReconnectedLedgers(ledgerDevices)
    const detachedLedgers = this.getDetachedLedgers(ledgerDevices)
    const attachedDevices = this.getAttachedDevices(ledgerDevices).filter(
      (device) => !reconnections.some((r) => r.device.devicePath === device.path)
    )

    return {
      attachedDevices,
      detachedLedgers,
      pendingDisconnections,
      reconnections
    }
  }

  private getAttachedDevices(connectedDevices: ConnectedDevice[]) {
    // attached devices are ones where a connected device
    // is not yet one of the currently known signers
    return connectedDevices.filter((device) => !(device.path in this.knownSigners))
  }

  private getDetachedLedgers(connectedDevices: ConnectedDevice[]) {
    // detached Ledgers are previously known signers that are
    // no longer one of the connected Ledger devices
    return Object.values(this.knownSigners).filter(
      (signer) => !connectedDevices.some((device) => device.path === signer.devicePath)
    )
  }

  private getReconnectedLedgers(connectedDevices: ConnectedDevice[]) {
    // group all the disconnections into ones that are either accounted for
    // by the currently connected devices (reconnections) or ones that are still
    // pending (pendingDisconnections)
    const { pendingDisconnections, reconnections } = this.disconnections.reduce(
      (resolved, disconnection) => {
        if (connectedDevices.some((device) => device.path === disconnection.device.devicePath)) {
          resolved.reconnections.push(disconnection)
        } else {
          resolved.pendingDisconnections.push(disconnection)
        }

        return resolved
      },
      { pendingDisconnections: [] as Array<Disconnection>, reconnections: [] as Array<Disconnection> }
    )

    // if we are still waiting on reconnections, check if any more devices have been added. if so, assume
    // that these are the reconnection events and allow any newly connected device to take the place
    // of a disconnected one. this mostly happens on Windows because the devices reconnect at a different
    // device path from the one from which they were disconnected
    while (pendingDisconnections.length > 0) {
      const reconnectedDevice = connectedDevices.find(
        (device) =>
          !reconnections.some((r) => r.device.devicePath === device.path) && !this.knownSigners[device.path]
      )

      if (reconnectedDevice) {
        const disconnection = pendingDisconnections.pop() as Disconnection
        this.knownSigners[reconnectedDevice.path] = disconnection.device
        delete this.knownSigners[disconnection.device.devicePath]

        disconnection.device.devicePath = reconnectedDevice.path

        reconnections.push(disconnection)
      } else break
    }

    return { pendingDisconnections, reconnections }
  }
}
