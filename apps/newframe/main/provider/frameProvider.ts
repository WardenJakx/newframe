import EventEmitter from 'events'

import {
  createError,
  createJsonRpcProvider,
  FrameWebSocketProvider,
  listenForProviderClose,
  sendRawPayload,
  withTimeout,
  type EthersRpcProvider,
  type ProviderOptions,
  type ProviderRequest,
  type RpcParams,
  type RpcPayload,
  type RpcResult,
  type SubscriptionPayload
} from './rpc'

export interface Eip1193Provider {
  request<T = unknown>(payload: ProviderRequest): Promise<T>
}

interface ProxyConnection extends EventEmitter {
  send(payload: JSONRPCRequestPayload): void
  close?: () => void
}

const frameTargets = ['ws://127.0.0.1:1248', 'http://127.0.0.1:1248']
const providerEvents = ['networkChanged', 'chainChanged', 'chainsChanged', 'accountsChanged', 'assetsChanged']
const DEFAULT_RECONNECT_INTERVAL = 5000
const MAX_RECONNECT_INTERVAL = 60 * 1000

function normalizeChainId(chainId: string | number) {
  return typeof chainId === 'number' ? `0x${chainId.toString(16)}` : chainId
}

function resolveTargets(targets?: string | string[]) {
  const requestedTargets = targets ? ([] as string[]).concat(targets) : ['frame']

  return requestedTargets
    .flatMap((target) => (target === 'frame' ? frameTargets : target))
    .filter((target) => /^(ws|http)s?:\/\//.test(target))
}

abstract class EventedRequestProvider extends EventEmitter implements Eip1193Provider {
  connected = false

  protected manualChainId?: string
  protected providerChainId?: string
  protected nextId = 1

  private attemptedSubscriptions = new Set<string>()
  private subscriptionEvents = new Map<string, string>()

  constructor() {
    super()

    this.on('newListener', (event) => {
      if (this.connected && this.shouldStartSubscription(event)) {
        this.startProviderSubscription(event as string)
      }
    })
  }

  get chainId() {
    return this.manualChainId || this.providerChainId
  }

  setChain(chainId: string | number) {
    const nextChainId = normalizeChainId(chainId)
    const changed = nextChainId !== this.chainId

    this.manualChainId = nextChainId

    if (changed) {
      this.emit('chainChanged', this.chainId)
    }
  }

  async request<T = unknown>(payload: ProviderRequest) {
    return this.send<T>(payload)
  }

  async send<T = unknown>(payload: ProviderRequest): Promise<T>
  async send<T = unknown>(method: string, params?: RpcParams): Promise<T>
  async send<T = unknown>(methodOrPayload: string | ProviderRequest, params?: RpcParams): Promise<T> {
    const payload = this.createPayload(methodOrPayload, params)

    if (!this.connected) {
      await this.waitForConnection()
    }

    const result = await this.sendPayload<T>(payload)
    this.handleRpcResult(payload.method, result)

    return result
  }

  protected createPayload(methodOrPayload: string | ProviderRequest, params?: RpcParams): RpcPayload {
    const payload =
      typeof methodOrPayload === 'string' ? { method: methodOrPayload, params } : { ...methodOrPayload }

    return {
      id: payload.id ?? this.nextId++,
      jsonrpc: payload.jsonrpc ?? '2.0',
      method: payload.method,
      params: payload.params ?? [],
      chainId: payload.chainId ?? this.manualChainId
    }
  }

  protected markConnected(chainId?: string) {
    this.providerChainId = chainId
    this.connected = true
    this.emit('connect', { chainId: this.chainId })
    this.resumeProviderSubscriptions()
  }

  protected markClosed() {
    this.connected = false
    this.clearProviderSubscriptions()
    this.emit('close')
    this.emit('disconnect')
  }

  protected handleSubscriptionPayload(payload: SubscriptionPayload) {
    const {
      params: { subscription, result }
    } = payload
    const event = this.subscriptionEvents.get(subscription)

    this.emit(subscription, result)
    this.emit(payload.method, payload.params)
    this.emit('message', { type: payload.method, data: payload.params })
    this.emit('data', payload)

    if (event) {
      this.handleProviderEvent(event, result)
    }
  }

  protected handleProviderError(error: unknown) {
    if (this.listenerCount('error') > 0) {
      this.emit('error', createError(error))
    }
  }

  protected clearProviderSubscriptions() {
    this.attemptedSubscriptions.clear()
    this.subscriptionEvents.clear()
  }

  protected waitForConnection() {
    return withTimeout(
      new Promise<void>((resolve) => this.once('connect', () => resolve())),
      5000,
      'Not connected'
    )
  }

  protected abstract sendPayload<T = unknown>(payload: RpcPayload): Promise<T>

  private handleRpcResult(method: string, result: unknown) {
    if (method === 'eth_chainId' && typeof result === 'string') {
      this.providerChainId = result
    } else if (['eth_accounts', 'eth_requestAccounts'].includes(method)) {
      const accounts = (result || []) as string[]
      ;(this as any).accounts = accounts
      ;(this as any).selectedAddress = accounts[0]
      ;(this as any).coinbase = accounts[0]
    }
  }

  private handleProviderEvent(event: string, result: unknown) {
    if (event === 'networkChanged') {
      ;(this as any).networkVersion = typeof result === 'string' ? parseInt(result) : result
      this.emit('networkChanged', (this as any).networkVersion)
    } else if (event === 'chainChanged') {
      this.providerChainId = result as string
      if (!this.manualChainId) this.emit('chainChanged', result)
    } else {
      this.emit(event, result)
    }
  }

  private shouldStartSubscription(event: string | symbol) {
    return (
      typeof event === 'string' && providerEvents.includes(event) && !this.attemptedSubscriptions.has(event)
    )
  }

  private async startProviderSubscription(event: string) {
    this.attemptedSubscriptions.add(event)

    try {
      const subId = await this.send<string>('eth_subscribe', [event])
      this.subscriptionEvents.set(subId, event)
    } catch (error) {
      this.handleProviderError(error)
    }
  }

  private resumeProviderSubscriptions() {
    providerEvents.forEach((event) => {
      if (this.listenerCount(event) > 0 && !this.attemptedSubscriptions.has(event)) {
        this.startProviderSubscription(event)
      }
    })
  }
}

class FrameProxyProvider extends EventedRequestProvider {
  private promises: Record<string, { resolve: (value: unknown) => void; reject: (err: Error) => void }> = {}

  constructor(private connection: ProxyConnection) {
    super()

    this.connection.on('connect', () => this.markConnected(this.chainId))
    this.connection.on('close', () => this.markClosed())
    this.connection.on('payload', (payload) => this.handlePayload(payload))
  }

  close() {
    this.connection.close?.()
    this.markClosed()
  }

  protected sendPayload<T = unknown>(payload: RpcPayload) {
    return new Promise<T>((resolve, reject) => {
      this.promises[payload.id] = { resolve: resolve as (value: unknown) => void, reject }

      try {
        this.connection.send(payload as JSONRPCRequestPayload)
      } catch (error) {
        delete this.promises[payload.id]
        reject(createError(error))
      }
    })
  }

  private handlePayload(payload: RpcResult | SubscriptionPayload) {
    if ('method' in payload && payload.method === 'eth_subscription') {
      this.handleSubscriptionPayload(payload)
      return
    }

    if (!('id' in payload) || typeof payload.id === 'undefined') return

    const promise = this.promises[payload.id]
    if (!promise) return

    delete this.promises[payload.id]

    if ('error' in payload && payload.error) {
      promise.reject(createError(payload.error))
    } else {
      promise.resolve(payload.result)
    }
  }
}

class FrameProvider extends EventedRequestProvider {
  private currentProvider?: EthersRpcProvider
  private connectTimer?: NodeJS.Timeout
  private connectAttempt = 0
  private reconnectDelay: number
  private closing = false

  constructor(
    private targets: string[],
    private options: ProviderOptions
  ) {
    super()

    this.reconnectDelay = this.baseReconnectInterval()
    this.connectTimer = setTimeout(() => this.connect(), 0)
  }

  close() {
    this.closing = true
    clearTimeout(this.connectTimer)
    this.clearProviderSubscriptions()

    const provider = this.currentProvider
    this.currentProvider = undefined

    if (provider) {
      void Promise.resolve(provider.destroy()).catch(() => {})
    }

    if (this.connected) {
      this.markClosed()
    }
  }

  protected async sendPayload<T = unknown>(payload: RpcPayload) {
    if (!this.currentProvider) throw new Error('Not connected')

    return sendRawPayload<T>(this.currentProvider, payload)
  }

  private connect(index = 0) {
    if (this.closing || !this.targets.length) return

    const attempt = ++this.connectAttempt
    const provider = createJsonRpcProvider(this.targets[index], this.options)

    this.currentProvider = provider
    this.attachProviderEvents(provider)

    withTimeout(
      sendRawPayload<string>(provider, this.createPayload('eth_chainId', [])),
      5000,
      'Not connected'
    )
      .then((chainId) => {
        if (attempt !== this.connectAttempt || this.closing || this.currentProvider !== provider) return

        this.markConnected(chainId)
        this.resetReconnectBackoff()
      })
      .catch((error) => {
        if (attempt !== this.connectAttempt || this.closing) return

        void Promise.resolve(provider.destroy()).catch(() => {})

        if (index < this.targets.length - 1) {
          this.connect(index + 1)
        } else {
          this.connected = false
          this.handleProviderError(error)
          this.scheduleReconnect()
        }
      })
  }

  private attachProviderEvents(provider: EthersRpcProvider) {
    void provider.on('error', (error) => this.handleProviderError(error))

    if (provider instanceof FrameWebSocketProvider) {
      provider.onFrameSubscription((payload: SubscriptionPayload) => this.handleSubscriptionPayload(payload))
    }

    listenForProviderClose(provider, () => {
      if (this.currentProvider === provider && !this.closing) {
        this.handleClose()
      }
    })
  }

  private handleClose() {
    if (this.connected) {
      this.markClosed()
    }

    clearTimeout(this.connectTimer)
    this.scheduleReconnect()
  }

  private baseReconnectInterval() {
    return this.options.interval || DEFAULT_RECONNECT_INTERVAL
  }

  private resetReconnectBackoff() {
    this.reconnectDelay = this.baseReconnectInterval()
  }

  private scheduleReconnect() {
    if (this.closing) return

    clearTimeout(this.connectTimer)
    const delay = this.reconnectDelay
    this.connectTimer = setTimeout(() => this.connect(0), delay)
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, MAX_RECONNECT_INTERVAL)
  }
}

export function createProxyProvider(connection: ProxyConnection) {
  return new FrameProxyProvider(connection)
}

export default function createFrameProvider(targets?: string | string[], options: ProviderOptions = {}) {
  return new FrameProvider(resolveTargets(targets), options)
}
