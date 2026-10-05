import EventEmitter from 'events'

import type { Common } from '@ethereumjs/common'
import { Hardfork } from '@ethereumjs/common'
import { addHexPrefix } from '@ethereumjs/util'
import type { ChainId as Chain } from '@newframe/schema/chains'
import type { GasFees } from '@newframe/schema/gas'
import type { EVMError, JSONRPCRequestPayload, RPCRequestCallback } from '@newframe/schema/rpc'
import type { TransactionData } from '@newframe/schema/transactions'
// status = Chain Mismatch, Not Connected, Connected, Standby, Syncing
import log from 'electron-log'
import { shallow } from 'zustand/vanilla/shallow'

import { CHAIN_PRESETS } from '../../../features/chains/domain/chain/presets.ts'
import chainConfig from './config.ts'
import { createGasCalculator } from './gas.ts'
import GasMonitor from './gasMonitor.ts'
import { estimateL1GasCost } from './l1GasFees.ts'
import type { ChainInternet, ChainsStatePort, ChainRuntime, ChainRules } from './ports.ts'
import {
  createJsonRpcProvider,
  listenForProviderClose,
  sendRpcPayload,
  type EthersRpcProvider
} from './transport.ts'

type Priority = 'primary' | 'secondary'
type ConnectionStatus =
  | 'chain mismatch'
  | 'connected'
  | 'disconnected'
  | 'error'
  | 'loading'
  | 'off'
  | 'standby'

type StoredConnection = {
  connected: boolean
  current: string
  custom: string
  on: boolean
  status: ConnectionStatus
}

type StoredChainSettings = {
  connection: {
    chain?: string
    primary: StoredConnection
    secondary: StoredConnection
  }
  on: boolean
}

const selectConnectionSettings = (chain: StoredChainSettings | null | undefined) => {
  if (!chain) {
    return null
  }

  const { primary, secondary } = chain.connection
  return [
    chain.on,
    chain.connection.chain,
    primary.on,
    primary.current,
    primary.custom,
    primary.status,
    secondary.on,
    secondary.current,
    secondary.custom
  ] as const
}

interface ConnectionState {
  status: ConnectionStatus
  chain: string
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

const normalizeRpcError = (error: unknown): EVMError => {
  if (typeof error === 'string') {
    return { message: error, code: -1 }
  }
  if (error instanceof Error) {
    const details = error as Error & { code?: unknown; data?: unknown }
    const normalized = {
      message: error.message,
      code: typeof details.code === 'number' ? details.code : -1,
      data: details.data
    }
    return normalized
  }
  if (error && typeof error === 'object' && 'message' in error) {
    const details = error as Record<string, unknown>
    const normalized = {
      message: typeof details.message === 'string' ? details.message : 'JSON-RPC request failed',
      code: typeof details.code === 'number' ? details.code : -1,
      data: details.data
    }
    return normalized
  }
  return { message: 'JSON-RPC request failed', code: -1 }
}

const resError = (error: unknown, payload: JSONRPCRequestPayload, res: RPCRequestCallback) =>
  res({
    id: payload.id,
    jsonrpc: payload.jsonrpc,
    error: normalizeRpcError(error)
  })

class ChainConnection extends EventEmitter {
  type: Chain['type']
  chainId: string
  chain?: string
  chainConfig: Common
  gasCalculator: ReturnType<typeof createGasCalculator>
  primary: ConnectionState
  secondary: ConnectionState
  private unsubscribeChain?: () => void
  private reconciling = false
  private reconcilePending = false

  private currentChain() {
    const chains = this.state.read().chains[this.type] as Record<
      number,
      ReturnType<typeof this.state.read>['chains']['ethereum'][number] | undefined
    >
    return chains[Number(this.chainId)]
  }

  private shouldReconcileAgain() {
    return this.reconcilePending
  }

  constructor(
    type: Chain['type'],
    chainId: string,
    private readonly state: ChainsStatePort,
    private readonly internet: ChainInternet
  ) {
    super()
    this.type = type
    this.chainId = chainId

    // default to legacy transaction rules until on-demand gas refresh confirms EIP-1559 support
    this.chainConfig = chainConfig(parseInt(this.chainId), 'istanbul')

    // TODO: maybe this can be tied into chain config somehow
    this.gasCalculator = createGasCalculator(this.chainId)

    this.primary = {
      status: 'off',
      chain: '',
      type: '',
      currentTarget: '',
      connected: false
    }

    this.secondary = {
      status: 'off',
      chain: '',
      type: '',
      currentTarget: '',
      connected: false
    }
  }

  open() {
    this.unsubscribeChain?.()
    this.unsubscribeChain = this.state.subscribe(
      (state) => selectConnectionSettings(state.chains[this.type][Number(this.chainId)]),
      () => this.reconcile(),
      { equalityFn: shallow, fireImmediately: true }
    )
  }

  private reconcile() {
    if (this.reconciling) {
      this.reconcilePending = true
      return
    }

    this.reconciling = true
    try {
      do {
        this.reconcilePending = false
        const chain = this.currentChain()
        if (chain) {
          this.connect(chain)
        }
      } while (this.shouldReconcileAgain())
    } finally {
      this.reconciling = false
    }
  }

  _createProvider(target: string, priority: Priority) {
    log.debug('createProvider', { chainId: this.chainId, priority })

    this.update(priority)

    const provider = createJsonRpcProvider(target, this.internet, {
      name: priority,
      origin: 'frame'
    })

    this[priority].provider = provider

    void provider.on('error', (err) => this.handleProviderError(priority, err))
    listenForProviderClose(provider, () => this.handleProviderClose(priority, provider))

    // connectProvider updates status and emits connection failures itself.
    void this.connectProvider(priority, provider)
  }

  _handleConnection(priority: Priority) {
    this._updateStatus(priority, 'connected')
    this.emit('connect')
  }

  private async connectProvider(priority: Priority, provider: EthersRpcProvider) {
    try {
      const chainId: unknown = await provider.send('eth_chainId', [])

      if (this[priority].provider !== provider) {
        return
      }

      this[priority].chain =
        typeof chainId === 'string' && chainId.startsWith('0x')
          ? parseInt(chainId, 16).toString()
          : String(chainId)

      if (this[priority].chain && this[priority].chain !== this.chainId) {
        this[priority].connected = false
        this[priority].type = ''
        this._updateStatus(priority, 'chain mismatch')
      } else {
        this[priority].connected = true
        this[priority].type = ''
        this._handleConnection(priority)
      }
    } catch (err) {
      if (this[priority].provider !== provider) {
        return
      }

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
    if (provider && this[priority].provider !== provider) {
      return
    }

    this[priority].connected = false
    this[priority].type = ''
    this[priority].chain = ''
    this.update(priority)
    this.emit('close')
  }

  update(priority: Priority) {
    const chain = this.currentChain()

    if (!chain) {
      // since we poll to re-connect there may be a timing issue where we try
      // to update a chain after it's been removed, so double-check here
      return
    }

    if (priority === 'primary') {
      const { status, connected, type, chain } = this.primary
      const details = { status, connected, type, chain }
      log.info(`Updating primary connection for chain ${this.chainId}`, details)
      this.state.setPrimary(this.type, Number(this.chainId), details)
    } else {
      const { status, connected, type, chain } = this.secondary
      const details = { status, connected, type, chain }
      log.info(`Updating secondary connection for chain ${this.chainId}`, details)
      this.state.setSecondary(this.type, Number(this.chainId), details)
    }
  }

  _updateStatus(priority: Priority, status: ConnectionStatus) {
    log.debug('Chains.updateStatus', { priority, status })

    this[priority].status = status
    this.update(priority)

    this.emit('update', { type: 'status', status })
  }

  resetConnection(priority: Priority, status: ConnectionStatus, target?: string) {
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
          this[priority].chain = ''
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
      Promise.resolve(provider.removeAllListeners()).catch((error: unknown) =>
        log.error('Could not remove provider listeners', error)
      )
      Promise.resolve(provider.destroy()).catch((error: unknown) =>
        log.error('Could not destroy provider', error)
      )
    }
  }

  connect(chain: StoredChainSettings) {
    const connection = chain.connection
    const nextChain = typeof connection.chain === 'string' ? connection.chain : ''

    log.info(this.type + ':' + this.chainId + "'s connection has been updated")

    if (this.chain !== nextChain) {
      this.killProvider(this.primary.provider)
      this.primary.provider = null
      this.killProvider(this.secondary.provider)
      this.secondary.provider = null
      this.primary = {
        status: 'loading',
        chain: '',
        type: '',
        connected: false
      }
      this.secondary = {
        status: 'loading',
        chain: '',
        type: '',
        connected: false
      }
      this.update('primary')
      this.update('secondary')
      log.info('Chain changed from ' + this.chain + ' to ' + nextChain)
      this.chain = nextChain
    }

    const currentPresets: Record<string, string> = {
      ...CHAIN_PRESETS.ethereum.default,
      ...(CHAIN_PRESETS.ethereum as Record<string, Record<string, string>>)[this.chainId]
    }

    const { primary, secondary } = this.state.read().chains[this.type][Number(this.chainId)].connection
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

    this.unsubscribeChain?.()
    this.unsubscribeChain = undefined

    this.killProvider(this.primary.provider)
    this.primary.provider = null

    this.killProvider(this.secondary.provider)
    this.secondary.provider = null

    if (update) {
      this.primary = {
        status: 'loading',
        chain: '',
        type: '',
        connected: false
      }
      this.secondary = {
        status: 'loading',
        chain: '',
        type: '',
        connected: false
      }
      this.update('primary')
      this.update('secondary')
    }
  }

  send(payload: JSONRPCRequestPayload, res: RPCRequestCallback) {
    if (this.primary.provider && this.primary.connected) {
      sendRpcPayload(this.primary.provider, payload)
        .then((result) => res({ id: payload.id, jsonrpc: payload.jsonrpc, result }))
        .catch((err: unknown) => resError(err, payload, res))
    } else if (this.secondary.provider && this.secondary.connected) {
      sendRpcPayload(this.secondary.provider, payload)
        .then((result) => res({ id: payload.id, jsonrpc: payload.jsonrpc, result }))
        .catch((err: unknown) => resError(err, payload, res))
    } else {
      resError('Not connected to Ethereum network', payload, res)
    }
  }

  private getActiveProvider() {
    if (this.primary.provider && this.primary.connected) {
      return this.primary.provider
    }
    if (this.secondary.provider && this.secondary.connected) {
      return this.secondary.provider
    }
    return null
  }

  async refreshGasFees() {
    const provider = this.getActiveProvider()
    if (!provider) {
      throw new Error(`No active provider for chain ${this.chainId}`)
    }

    const chainId = parseInt(this.chainId)
    const gasMonitor = new GasMonitor(provider)
    const allowEip1559 = !legacyChains.includes(chainId)
    let feeMarket: GasFees | null = null

    if (allowEip1559) {
      try {
        const feeHistory = await gasMonitor.getFeeHistory(20, [10, 60])
        feeMarket = this.gasCalculator.calculateGas(feeHistory)
        this.chainConfig.setHardfork(Hardfork.London)
      } catch (e) {
        log.debug(`could not load EIP-1559 fee market for chain ${this.chainId}`, e)
      }
    }

    if (feeMarket?.maxBaseFeePerGas && feeMarket.maxPriorityFeePerGas) {
      const gasPrice = parseInt(feeMarket.maxBaseFeePerGas) + parseInt(feeMarket.maxPriorityFeePerGas)

      this.state.setGasPrices(this.type, chainId, {
        fast: addHexPrefix(gasPrice.toString(16))
      })
      this.state.setGasDefault(this.type, chainId, 'fast')
    } else {
      const gas = await gasMonitor.getGasPrices()
      const customLevel = this.state.read().chainsMeta[this.type][chainId].gas.price.levels.custom

      this.state.setGasPrices(this.type, chainId, {
        ...gas,
        custom: customLevel ?? gas.fast
      })
    }

    this.state.setGasFees(this.type, chainId, feeMarket)
  }
}

class ChainsRuntime extends EventEmitter {
  private connections: Record<Chain['type'], Record<string, ChainConnection | undefined>>
  private startRuntime: () => void = () => {}
  private disposeRuntime: () => void = () => {}
  private started = false

  constructor(
    private readonly state: ChainsStatePort,
    internet: ChainInternet
  ) {
    super()
    this.connections = { ethereum: {} }

    const activeConnectionIds = () =>
      Object.keys(this.connections)
        .map((type) =>
          Object.keys(this.connections[type as Chain['type']]).map((chainId) => `${type}:${chainId}`)
        )
        .flat()

    const markConnectionInactive = (chainId: string, type: Chain['type'] = 'ethereum') => {
      const numericChainId = Number(chainId)
      const chain = (
        this.state.read().chains[type] as Record<
          number,
          ReturnType<typeof this.state.read>['chains']['ethereum'][number] | undefined
        >
      )[numericChainId]
      if (!chain) {
        return
      }

      this.state.setPrimary(type, numericChainId, {
        status: chain.connection.primary.on ? 'disconnected' : 'off',
        connected: false,
        type: '',
        chain: ''
      })

      this.state.setSecondary(type, numericChainId, {
        status: chain.connection.secondary.on ? 'disconnected' : 'off',
        connected: false,
        type: '',
        chain: ''
      })
    }

    const removeConnection = (chainId: string, type: Chain['type'] = 'ethereum') => {
      const connections = this.connections[type]
      const connection = connections[chainId]
      if (connection) {
        connection.removeAllListeners()
        connection.close(false)
        delete connections[chainId]
      }
    }

    const sleepConnection = (chainId: string, type: Chain['type'] = 'ethereum') => {
      removeConnection(chainId, type)
      markConnectionInactive(chainId, type)
    }

    const sleepConnections = () => {
      const connections = activeConnectionIds()
      log.info('Internet closed, closing active chain connections', {
        chains: connections
      })

      connections.forEach((id) => {
        const [type, chainId] = id.split(':')
        sleepConnection(chainId, type as Chain['type'])
      })
    }

    const updateConnections = () => {
      if (!internet.isOpen()) {
        log.debug('Skipping chain connection updates while the internet is closed')
        return
      }

      const chains = this.state.read().chains

      ;(Object.keys(this.connections) as Chain['type'][]).forEach((type) => {
        const connections = this.connections[type]
        Object.keys(connections).forEach((chainId) => {
          const chainsById = chains[type] as Record<number, (typeof chains.ethereum)[number] | undefined>
          if (!chainsById[Number(chainId)]) {
            removeConnection(chainId, type)
          }
        })
      })
      ;(Object.keys(chains) as Chain['type'][]).forEach((type) => {
        const connections = this.connections[type]
        Object.keys(chains[type]).forEach((chainId) => {
          const chainConfig = chains[type][Number(chainId)]
          if (chainConfig.on && !connections[chainId]) {
            const connection = new ChainConnection(type, chainId, this.state, internet)
            connections[chainId] = connection

            connection.on('connect', (...args: unknown[]) => {
              this.emit('connect', { type, id: chainId }, ...args)
            })

            connection.on('close', (...args: unknown[]) => {
              this.emit('close', { type, id: chainId }, ...args)
            })

            connection.on('data', (...args: unknown[]) => {
              this.emit('data', { type, id: chainId }, ...args)
            })

            connection.on('update', (...args: unknown[]) => {
              this.emit('update', { type, id: parseInt(chainId) }, ...args)
            })

            connection.on('error', (...args: unknown[]) => {
              this.emit('error', { type, id: chainId }, ...args)
            })

            connection.open()
          } else if (!chainConfig.on && connections[chainId]) {
            connections[chainId].removeAllListeners()
            connections[chainId].close()
            delete connections[chainId]
          }
        })
      })
    }

    const handleInternetChange = (open: boolean) => {
      if (open) {
        log.info('Internet open, restoring chain connections')
        updateConnections()
      } else {
        sleepConnections()
      }
    }

    let unsubscribeChains: (() => void) | undefined
    let unsubscribeInternet: (() => void) | undefined
    this.startRuntime = () => {
      updateConnections()
      unsubscribeInternet = internet.subscribe(handleInternetChange)
      unsubscribeChains = this.state.subscribe(
        (state) =>
          Object.values(state.chains.ethereum)
            .map((chain) => `${chain.id}:${chain.on}`)
            .sort()
            .join(','),
        updateConnections
      )
    }
    this.disposeRuntime = () => {
      unsubscribeChains?.()
      unsubscribeChains = undefined
      unsubscribeInternet?.()
      unsubscribeInternet = undefined
      activeConnectionIds().forEach((id) => {
        const [type, chainId] = id.split(':')
        removeConnection(chainId, type as Chain['type'])
      })
    }
  }

  start() {
    if (this.started) {
      return
    }
    this.started = true
    try {
      this.startRuntime()
    } catch (error) {
      this.dispose()
      throw error
    }
  }

  dispose() {
    if (this.started) {
      this.disposeRuntime()
      this.started = false
    }
    this.removeAllListeners()
  }

  send(payload: JSONRPCRequestPayload, res: RPCRequestCallback, targetChain?: Chain) {
    if (!targetChain) {
      resError({ message: `Target chain did not exist for send`, code: -32601 }, payload, res)
    }
    const { type, id } = targetChain as Chain
    const connection = this.connections[type]?.[id]
    if (!connection) {
      resError(
        {
          message: `Connection for ${type} chain with chainId ${id} did not exist for send`,
          code: -32601
        },
        payload,
        res
      )
    } else {
      connection.send(payload, res)
    }
  }

  hasConnection(chain: Chain) {
    return Boolean(this.connections[chain.type]?.[chain.id])
  }

  isConnected(chain: Chain) {
    const connection = this.connections[chain.type]?.[chain.id]
    return Boolean(connection && (connection.primary.connected || connection.secondary.connected))
  }

  transactionRules(chain: Chain): ChainRules | undefined {
    const connection = this.connections[chain.type]?.[chain.id]
    return connection ? { isActivatedEIP: (eip) => connection.chainConfig.isActivatedEIP(eip) } : undefined
  }

  async estimateL1GasCost(txData: TransactionData) {
    const { chainId, type, ...tx } = txData
    const txRequest = { ...tx, type: parseInt(type, 16), chainId: parseInt(chainId, 16) }
    const connection = this.connections.ethereum[txRequest.chainId]
    const connectedProvider = connection?.primary.connected
      ? connection.primary.provider
      : connection?.secondary.provider
    if (!connectedProvider) {
      return 0n
    }
    return estimateL1GasCost(connectedProvider, txRequest)
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

export function createChainsRuntime(state: ChainsStatePort, internet: ChainInternet): ChainRuntime {
  const runtime = new ChainsRuntime(state, internet)
  return {
    hasConnection: (chain) => runtime.hasConnection(chain),
    isConnected: (chain) => runtime.isConnected(chain),
    transactionRules: (chain) => runtime.transactionRules(chain),
    estimateL1GasCost: (transaction) => runtime.estimateL1GasCost(transaction),
    refreshGasFees: (chain) => runtime.refreshGasFees(chain),
    send: (payload, respond, chain) => runtime.send(payload, respond, chain),
    on: (event, listener) => {
      runtime.on(event, listener)
    },
    off: (event, listener) => {
      runtime.off(event, listener)
    },
    once: (event, listener) => {
      runtime.once(event, listener)
    },
    start: () => runtime.start(),
    dispose: () => runtime.dispose()
  }
}
