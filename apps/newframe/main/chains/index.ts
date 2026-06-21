// status = Network Mismatch, Not Connected, Connected, Standby, Syncing
import { powerMonitor } from 'electron'
import EventEmitter from 'events'
import { addHexPrefix } from '@ethereumjs/util'
import { Hardfork, Common } from '@ethereumjs/common'
import log from 'electron-log'

import store from '../store'
import chainConfig from './config'
import GasMonitor from '../transaction/gasMonitor'
import { createGasCalculator } from './gas'
import { NETWORK_PRESETS } from '../../resources/constants'
import {
  createJsonRpcProvider,
  listenForProviderClose,
  sendRpcPayload,
  type EthersRpcProvider
} from '../provider/connection'

export interface Chain {
  id: number
  type: 'ethereum'
}

type Priority = 'primary' | 'secondary'

interface ConnectionState {
  status: string
  network: string
  type: string
  connected: boolean
  currentTarget?: string
  provider?: EthersRpcProvider | null
}

// These chain IDs are known to not support EIP-1559 and will be forced
// not to use that mechanism
// TODO: create a more general chain config that can use the block number
// and ethereumjs/common to determine the state of various EIPs
const legacyChains = [250, 4002]

const normalizeRpcError = (error: any) => {
  if (typeof error === 'string') return { message: error, code: -1 }
  if (error instanceof Error)
    return { message: error.message, code: (error as any).code || -1, data: (error as any).data }
  return error
}

const resError = (error: any, payload: any, res: (response: any) => void) =>
  res({
    id: payload.id,
    jsonrpc: payload.jsonrpc,
    error: normalizeRpcError(error)
  })

class ChainConnection extends EventEmitter {
  type: string
  chainId: string
  network?: string
  chainConfig: Common
  gasCalculator: ReturnType<typeof createGasCalculator>
  primary: ConnectionState
  secondary: ConnectionState
  observer: { remove: () => void }

  constructor(type: string, chainId: string) {
    super()
    this.type = type
    this.chainId = chainId

    // default to legacy transaction rules until on-demand gas refresh confirms EIP-1559 support
    this.chainConfig = chainConfig(parseInt(this.chainId), 'istanbul')

    // TODO: maybe this can be tied into chain config somehow
    this.gasCalculator = createGasCalculator(this.chainId as any)

    this.primary = {
      status: 'off',
      network: '',
      type: '',
      currentTarget: '',
      connected: false
    }

    this.secondary = {
      status: 'off',
      network: '',
      type: '',
      currentTarget: '',
      connected: false
    }

    this.observer = store.observer(() => {
      const chain = store('main.networks', type, chainId)
      if (chain) this.connect(chain)
    })
  }

  _createProvider(target: string, priority: Priority) {
    log.debug('createProvider', { chainId: this.chainId, priority })

    this.update(priority)

    const provider = createJsonRpcProvider(target, {
      name: priority,
      origin: 'frame'
    })

    this[priority].provider = provider

    void provider.on('error', (err) => this.handleProviderError(priority, err))
    listenForProviderClose(provider, () => this.handleProviderClose(priority, provider))

    this.connectProvider(priority, provider)
  }

  _handleConnection(priority: Priority) {
    this._updateStatus(priority, 'connected')
    this.emit('connect')
  }

  private async connectProvider(priority: Priority, provider: EthersRpcProvider) {
    try {
      const chainId = await provider.send('eth_chainId', [])

      if (this[priority].provider !== provider) return

      this[priority].network =
        typeof chainId === 'string' && chainId.startsWith('0x')
          ? parseInt(chainId, 16).toString()
          : String(chainId)

      if (this[priority].network && this[priority].network !== this.chainId) {
        this[priority].connected = false
        this[priority].type = ''
        this._updateStatus(priority, 'chain mismatch')
      } else {
        this[priority].connected = true
        this[priority].type = ''
        this._handleConnection(priority)
      }
    } catch (err) {
      if (this[priority].provider !== provider) return

      this[priority].connected = false
      this[priority].type = ''
      this._updateStatus(priority, 'error')
      this.emit('error', err)
    }
  }

  private handleProviderError(priority: Priority, err: unknown) {
    this[priority].connected = false
    this[priority].type = ''
    this._updateStatus(priority, 'error')
    this.emit('error', err)
  }

  private handleProviderClose(priority: Priority, provider?: EthersRpcProvider | null) {
    if (provider && this[priority].provider !== provider) return

    this[priority].connected = false
    this[priority].type = ''
    this[priority].network = ''
    this.update(priority)
    this.emit('close')
  }

  update(priority: Priority) {
    const network = store('main.networks', this.type, this.chainId)

    if (!network) {
      // since we poll to re-connect there may be a timing issue where we try
      // to update a network after it's been removed, so double-check here
      return
    }

    if (priority === 'primary') {
      const { status, connected, type, network } = this.primary
      const details = { status, connected, type, network }
      log.info(`Updating primary connection for chain ${this.chainId}`, details)
      store.setPrimary(this.type, this.chainId, details)
    } else if (priority === 'secondary') {
      const { status, connected, type, network } = this.secondary
      const details = { status, connected, type, network }
      log.info(`Updating secondary connection for chain ${this.chainId}`, details)
      store.setSecondary(this.type, this.chainId, details)
    }
  }

  _updateStatus(priority: Priority, status: string) {
    log.debug('Chains.updateStatus', { priority, status })

    this[priority].status = status
    this.update(priority)

    this.emit('update', { type: 'status', status })
  }

  resetConnection(priority: Priority, status: string, target?: string) {
    log.debug('resetConnection', { priority, status, target })

    const provider = this[priority].provider
    const wasConnected = this[priority].connected

    this.killProvider(provider)
    this[priority].provider = null
    this[priority].connected = false
    this[priority].type = ''

    if (['off', 'disconnected', 'standby'].includes(status)) {
      if (this[priority].status !== status) {
        if (['off', 'disconnected'].includes(status)) {
          this[priority].network = ''
        }

        this._updateStatus(priority, status)
      }
    } else {
      this[priority].currentTarget = target
      this[priority].status = status
    }

    if (wasConnected) {
      this.emit('close')
    }
  }

  killProvider(provider?: EthersRpcProvider | null) {
    log.debug('killProvider', { provider })

    if (provider) {
      const removeResult = provider.removeAllListeners()
      if (removeResult && typeof (removeResult as any).catch === 'function') {
        ;(removeResult as Promise<unknown>).catch(() => {})
      }

      void Promise.resolve(provider.destroy()).catch(() => {})
    }
  }

  connect(chain: any) {
    const connection = chain.connection

    log.info(this.type + ':' + this.chainId + "'s connection has been updated")

    if (this.network !== connection.network) {
      this.killProvider(this.primary.provider)
      this.primary.provider = null
      this.killProvider(this.secondary.provider)
      this.secondary.provider = null
      this.primary = { status: 'loading', network: '', type: '', connected: false }
      this.secondary = { status: 'loading', network: '', type: '', connected: false }
      this.update('primary')
      this.update('secondary')
      log.info('Network changed from ' + this.network + ' to ' + connection.network)
      this.network = connection.network
    }

    const currentPresets: Record<string, string> = {
      ...NETWORK_PRESETS.ethereum.default,
      ...(NETWORK_PRESETS.ethereum as Record<string, any>)[this.chainId]
    }

    const { primary, secondary } = store('main.networks', this.type, this.chainId, 'connection')
    const secondaryTarget =
      secondary.current === 'custom' ? secondary.custom : currentPresets[secondary.current]

    if (chain.on && connection.secondary.on) {
      log.info('Secondary connection: ON')

      if (connection.primary.on && connection.primary.status === 'connected') {
        // Connection is on Standby
        log.info('Secondary connection on STANDBY', connection.secondary.status === 'standby')

        this.resetConnection('secondary', 'standby')
      } else if (!secondaryTarget) {
        // if no target is provided automatically set state to disconnected
        this.resetConnection('secondary', 'disconnected')
      } else if (!this.secondary.provider || this.secondary.currentTarget !== secondaryTarget) {
        log.info("Creating secondary connection because it didn't exist or the target changed", {
          secondaryTarget
        })

        this.resetConnection('secondary', 'loading', secondaryTarget)
        this._createProvider(secondaryTarget, 'secondary')
      }
    } else {
      // Secondary connection is set to OFF by the user
      log.info('Secondary connection: OFF')

      this.resetConnection('secondary', 'off')
    }

    const primaryTarget = primary.current === 'custom' ? primary.custom : currentPresets[primary.current]

    if (chain.on && connection.primary.on) {
      log.info('Primary connection: ON')

      if (!primaryTarget) {
        // if no target is provided automatically set state to disconnected
        this.resetConnection('primary', 'disconnected')
      } else if (!this.primary.provider || this.primary.currentTarget !== primaryTarget) {
        log.info("Creating primary connection because it didn't exist or the target changed", {
          primaryTarget
        })

        this.resetConnection('primary', 'loading', primaryTarget)
        this._createProvider(primaryTarget, 'primary')
      }
    } else {
      log.info('Primary connection: OFF')
      this.resetConnection('primary', 'off')
    }
  }

  close(update = true) {
    log.verbose(`closing chain ${this.chainId}`, { update })

    if (this.observer) this.observer.remove()

    this.killProvider(this.primary.provider)
    this.primary.provider = null

    this.killProvider(this.secondary.provider)
    this.secondary.provider = null

    if (update) {
      this.primary = { status: 'loading', network: '', type: '', connected: false }
      this.secondary = { status: 'loading', network: '', type: '', connected: false }
      this.update('primary')
      this.update('secondary')
    }
  }

  send(payload: any, res: (response: any) => void) {
    if (this.primary.provider && this.primary.connected) {
      sendRpcPayload(this.primary.provider, payload)
        .then((result) => res({ id: payload.id, jsonrpc: payload.jsonrpc || '2.0', result }))
        .catch((err) => resError(err, payload, res))
    } else if (this.secondary.provider && this.secondary.connected) {
      sendRpcPayload(this.secondary.provider, payload)
        .then((result) => res({ id: payload.id, jsonrpc: payload.jsonrpc || '2.0', result }))
        .catch((err) => resError(err, payload, res))
    } else {
      resError('Not connected to Ethereum network', payload, res)
    }
  }

  private getActiveProvider() {
    if (this.primary.provider && this.primary.connected) return this.primary.provider
    if (this.secondary.provider && this.secondary.connected) return this.secondary.provider
    return null
  }

  async refreshGasFees() {
    const provider = this.getActiveProvider()
    if (!provider) throw new Error(`No active provider for chain ${this.chainId}`)

    const chainId = parseInt(this.chainId)
    const gasMonitor = new GasMonitor(provider)
    const allowEip1559 = !legacyChains.includes(chainId)
    let feeMarket: any = null

    if (allowEip1559) {
      try {
        const feeHistory = await gasMonitor.getFeeHistory(20, [10, 60])
        feeMarket = this.gasCalculator.calculateGas(feeHistory)
        this.chainConfig.setHardfork(Hardfork.London)
      } catch (e) {
        log.debug(`could not load EIP-1559 fee market for chain ${this.chainId}`, e)
      }
    }

    if (feeMarket) {
      const gasPrice = parseInt(feeMarket.maxBaseFeePerGas) + parseInt(feeMarket.maxPriorityFeePerGas)

      store.setGasPrices(this.type, chainId, { fast: addHexPrefix(gasPrice.toString(16)) })
      store.setGasDefault(this.type, chainId, 'fast')
    } else {
      const gas = await gasMonitor.getGasPrices()
      const customLevel = store('main.networksMeta', this.type, chainId, 'gas.price.levels.custom')

      store.setGasPrices(this.type, chainId, {
        ...gas,
        custom: customLevel || gas.fast
      })
    }

    store.setGasFees(this.type, chainId, feeMarket)
  }
}

class Chains extends EventEmitter {
  connections: Record<string, Record<string, ChainConnection>>

  constructor() {
    super()
    this.connections = {}

    let systemSuspended = false
    let screenLocked = false

    const isSystemInactive = () => systemSuspended || screenLocked

    const activeConnectionIds = () =>
      Object.keys(this.connections)
        .map((type) => Object.keys(this.connections[type]).map((chainId) => `${type}:${chainId}`))
        .flat()

    const markConnectionInactive = (chainId: string, type = 'ethereum') => {
      const network = store('main.networks', type, chainId)
      if (!network) return

      store.setPrimary(type, chainId, {
        status: network.connection.primary.on ? 'disconnected' : 'off',
        connected: false,
        type: '',
        network: ''
      })

      store.setSecondary(type, chainId, {
        status: network.connection.secondary.on ? 'disconnected' : 'off',
        connected: false,
        type: '',
        network: ''
      })
    }

    const removeConnection = (chainId: string, type = 'ethereum') => {
      if (type in this.connections && chainId in this.connections[type]) {
        this.connections[type][chainId].removeAllListeners()
        this.connections[type][chainId].close(false)
        delete this.connections[type][chainId]
      }
    }

    const sleepConnection = (chainId: string, type = 'ethereum') => {
      removeConnection(chainId, type)
      markConnectionInactive(chainId, type)
    }

    const sleepConnections = (reason: string) => {
      const connections = activeConnectionIds()
      log.info(`System ${reason}, closing active chain connections`, { chains: connections })

      connections.forEach((id) => {
        const [type, chainId] = id.split(':')
        sleepConnection(chainId, type)
      })
    }

    const updateConnections = () => {
      if (isSystemInactive()) {
        log.debug('Skipping chain connection updates while system is inactive', {
          systemSuspended,
          screenLocked
        })
        return
      }

      const networks = store('main.networks')

      Object.keys(this.connections).forEach((type) => {
        Object.keys(this.connections[type]).forEach((chainId) => {
          if (!networks[type][chainId]) {
            removeConnection(chainId, type)
          }
        })
      })

      Object.keys(networks).forEach((type) => {
        this.connections[type] = this.connections[type] || {}
        Object.keys(networks[type]).forEach((chainId) => {
          const chainConfig = networks[type][chainId]
          if (chainConfig.on && !this.connections[type][chainId]) {
            this.connections[type][chainId] = new ChainConnection(type, chainId)

            this.connections[type][chainId].on('connect', (...args) => {
              this.emit('connect', { type, id: chainId }, ...args)
            })

            this.connections[type][chainId].on('close', (...args) => {
              this.emit('close', { type, id: chainId }, ...args)
            })

            this.connections[type][chainId].on('data', (...args) => {
              this.emit('data', { type, id: chainId }, ...args)
            })

            this.connections[type][chainId].on('update', (...args) => {
              this.emit('update', { type, id: parseInt(chainId) }, ...args)
            })

            this.connections[type][chainId].on('error', (...args) => {
              this.emit('error', { type, id: chainId }, ...args)
            })
          } else if (!chainConfig.on && this.connections[type][chainId]) {
            this.connections[type][chainId].removeAllListeners()
            this.connections[type][chainId].close()
            delete this.connections[type][chainId]
          }
        })
      })
    }

    const wakeConnections = (reason: string) => {
      if (isSystemInactive()) {
        log.info(`System ${reason}, keeping chain connections closed`, { systemSuspended, screenLocked })
        return
      }

      log.info(`System ${reason}, restoring chain connections`)
      updateConnections()
    }

    powerMonitor.on('suspend', () => {
      systemSuspended = true
      sleepConnections('suspending')
    })

    powerMonitor.on('lock-screen', () => {
      screenLocked = true
      sleepConnections('locked')
    })

    powerMonitor.on('resume', () => {
      systemSuspended = false
      wakeConnections('resuming')
    })

    powerMonitor.on('unlock-screen', () => {
      screenLocked = false
      wakeConnections('unlocked')
    })

    store.observer(updateConnections, 'chains:connections')
  }

  send(payload: JSONRPCRequestPayload, res: RPCRequestCallback, targetChain?: Chain) {
    if (!targetChain) {
      resError({ message: `Target chain did not exist for send`, code: -32601 }, payload, res)
    }
    const { type, id } = targetChain as Chain
    if (!this.connections[type] || !this.connections[type][id]) {
      resError(
        { message: `Connection for ${type} chain with chainId ${id} did not exist for send`, code: -32601 },
        payload,
        res
      )
    } else {
      this.connections[type][id].send(payload, res)
    }
  }

  async refreshGasFees(targetChain: Chain) {
    const { type, id } = targetChain
    const connection = this.connections[type]?.[id]

    if (!connection) {
      throw new Error(`Connection for ${type} chain with chainId ${id} did not exist for gas refresh`)
    }

    await connection.refreshGasFees()
  }
}

export default new Chains()
