import EventEmitter from 'events'

type JsonRpcParams = readonly unknown[]
type JsonRpcCallback<T = JsonRpcResponse | JsonRpcResponse[]> = (err: unknown, response?: T) => void

export interface JsonRpcPayload {
  id?: number | string
  jsonrpc?: '2.0'
  method: string
  params?: JsonRpcParams
  chainId?: string
  __extensionConnecting?: boolean
}

interface JsonRpcResponse {
  id?: number | string
  jsonrpc?: '2.0'
  result?: unknown
  error?: unknown
}

interface SubscriptionPayload {
  method: string
  params: {
    subscription: string
    result: unknown
  }
}

interface PendingRequest {
  method: string
  resolve: (value: unknown) => void
  reject: (error: unknown) => void
}

export interface ProviderConnection extends EventEmitter {
  on(event: 'connect' | 'close', listener: () => void): this
  on(event: 'payload', listener: (payload: unknown) => void): this
  send(payload: JsonRpcPayload): void
  close?: () => void
}

type ProviderEvent = 'networkChanged' | 'chainChanged' | 'chainsChanged' | 'accountsChanged' | 'assetsChanged'
type ProviderEventResult = {
  networkChanged: string | number
  chainChanged: string
  chainsChanged: string[]
  accountsChanged: string[]
  assetsChanged: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isJsonRpcPayload(value: unknown): value is JsonRpcPayload {
  if (!isRecord(value) || typeof value.method !== 'string') {
    return false
  }

  return (
    (value.id === undefined || typeof value.id === 'number' || typeof value.id === 'string') &&
    (value.jsonrpc === undefined || value.jsonrpc === '2.0') &&
    (value.params === undefined || Array.isArray(value.params)) &&
    (value.chainId === undefined || typeof value.chainId === 'string') &&
    (value.__extensionConnecting === undefined || typeof value.__extensionConnecting === 'boolean')
  )
}

function isJsonRpcCallback(value: unknown): value is JsonRpcCallback {
  return typeof value === 'function'
}

function isJsonRpcId(value: unknown): value is number | string {
  return typeof value === 'number' || typeof value === 'string'
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item: unknown) => typeof item === 'string')
}

function isJsonRpcResponse(value: unknown): value is JsonRpcResponse & { id: number | string } {
  return isRecord(value) && isJsonRpcId(value.id) && (value.jsonrpc === undefined || value.jsonrpc === '2.0')
}

function isSubscriptionPayload(value: unknown): value is SubscriptionPayload {
  return (
    isRecord(value) &&
    typeof value.method === 'string' &&
    isRecord(value.params) &&
    typeof value.params.subscription === 'string' &&
    'result' in value.params
  )
}

function createPayload(method: string, params: JsonRpcParams = [], id: number, targetChain?: string) {
  const payload: JsonRpcPayload = { id, method, params, jsonrpc: '2.0' }

  if (targetChain) {
    payload.chainId = targetChain
  }

  if (method !== 'eth_sendTransaction') {
    return payload
  }

  const tx = payload.params?.[0]
  const txParams = isRecord(tx) ? tx : {}
  const txChainId =
    typeof txParams.chainId === 'string' || typeof txParams.chainId === 'number'
      ? txParams.chainId
      : undefined

  if (txChainId && parseInt(String(txChainId)) !== parseInt(payload.chainId ?? String(txChainId))) {
    throw new Error(
      `Payload chainId (${txChainId}) inconsistent with specified target chainId: ${targetChain}`
    )
  }

  return {
    ...payload,
    params: [{ ...txParams, chainId: txChainId ?? payload.chainId }, ...(payload.params ?? []).slice(1)]
  }
}

function normalizeChainId(chainId: string | number) {
  return typeof chainId === 'number' ? `0x${chainId.toString(16)}` : chainId
}

export default class InjectedFrameProvider extends EventEmitter {
  private eventHandlers: { [Event in ProviderEvent]: (result: ProviderEventResult[Event]) => void }
  private promises: Record<number | string, PendingRequest> = {}
  private attemptedSubscriptions = new Set<string>()
  private subscriptions: string[] = []
  private networkVersion?: string | number
  private manualChainId?: string
  private providerChainId?: string
  private checkConnectionRunning = false
  private checkConnectionTimer?: ReturnType<typeof setTimeout>
  private readonly resumeSubscriptionsHandler = () => this.resumeSubscriptions()

  nextId = 1
  connected = false
  accounts: string[] = []
  selectedAddress?: string
  coinbase?: string
  isNewframe?: boolean
  isFrame?: boolean
  isMetaMask?: boolean
  _metamask?: { isUnlocked: () => Promise<boolean> }

  constructor(private connection: ProviderConnection) {
    super()

    this.enable = this.enable.bind(this)
    this.doSend = this.doSend.bind(this)
    this.send = this.send.bind(this)
    this.subscribe = this.subscribe.bind(this)
    this.unsubscribe = this.unsubscribe.bind(this)
    this.sendAsync = this.sendAsync.bind(this)
    this.isConnected = this.isConnected.bind(this)
    this.close = this.close.bind(this)
    this.request = this.request.bind(this)
    this.resumeSubscriptions = this.resumeSubscriptions.bind(this)

    this.eventHandlers = {
      networkChanged: (netId) => {
        this.networkVersion = typeof netId === 'string' ? parseInt(netId) : netId
        this.emit('networkChanged', this.networkVersion)
      },
      chainChanged: (chainId) => {
        this.providerChainId = chainId
        if (!this.manualChainId) {
          this.emit('chainChanged', chainId)
        }
      },
      chainsChanged: (chains) => this.emit('chainsChanged', chains),
      accountsChanged: (accounts) => {
        this.selectedAddress = accounts[0]
        this.emit('accountsChanged', accounts)
      },
      assetsChanged: (assets) => this.emit('assetsChanged', assets)
    }

    this.on('connect', this.resumeSubscriptionsHandler)
    this.on('newListener', (event: string | symbol) => this.handleNewListener(event))

    this.connection.on('connect', () => {
      this.checkConnection(1000).catch(console.error)
    })
    this.connection.on('close', () => this.handleClose())
    this.connection.on('payload', (payload: unknown) => this.handlePayload(payload))
  }

  get chainId() {
    return this.manualChainId ?? this.providerChainId
  }

  async checkConnection(retryTimeout = 4000) {
    if (this.checkConnectionRunning || this.connected) {
      return
    }

    clearTimeout(this.checkConnectionTimer)
    this.checkConnectionTimer = undefined
    this.checkConnectionRunning = true

    try {
      this.networkVersion = (await this.doSend('net_version', [], undefined, false)) as string
      this.providerChainId = (await this.doSend('eth_chainId', [], undefined, false)) as string
      this.connected = true
    } catch (e) {
      if (!(typeof e === 'object' && e !== null && 'code' in e && e.code === 4001)) {
        this.checkConnectionTimer = setTimeout(() => {
          this.checkConnection().catch(console.error)
        }, retryTimeout)
      }
      this.connected = false
    } finally {
      this.checkConnectionRunning = false
      if (this.connected) {
        this.emit('connect', { chainId: this.providerChainId })
      }
    }
  }

  async enable() {
    const accounts = (await this.doSend('eth_requestAccounts')) as string[]

    if (accounts.length > 0) {
      this.accounts = accounts
      this.selectedAddress = accounts[0]
      this.coinbase = accounts[0]
      this.emit('enable')
      return accounts
    }

    const err = new Error('User Denied Full Provider') as Error & {
      code?: string
    }
    err.code = '4001'
    throw err
  }

  doSend(
    rawPayload: string | JsonRpcPayload,
    rawParams: JsonRpcParams = [],
    targetChain = this.manualChainId,
    waitForConnection = true
  ) {
    const send = (resolve: (value: unknown) => void, reject: (error: unknown) => void) => {
      const method = typeof rawPayload === 'object' ? rawPayload.method : rawPayload
      const params = typeof rawPayload === 'object' ? (rawPayload.params ?? []) : rawParams
      const chainTarget = typeof rawPayload === 'object' ? (rawPayload.chainId ?? targetChain) : targetChain

      if (!method) {
        reject(new Error('Method is not a valid string.'))
        return
      }

      try {
        const id = this.nextId++
        const payload = createPayload(method, params, id, chainTarget)

        if (!waitForConnection && (method === 'eth_chainId' || method === 'net_version')) {
          payload.__extensionConnecting = true
        }

        this.promises[id] = { resolve, reject, method }
        this.connection.send(payload)
      } catch (e) {
        reject(e)
      }
    }

    if (this.connected || !waitForConnection) {
      return new Promise(send)
    }

    return new Promise((resolve, reject) => {
      const resolveSend = () => {
        clearTimeout(disconnectTimer)
        resolve(new Promise(send))
      }
      const disconnectTimer = setTimeout(() => {
        this.off('connect', resolveSend)
        reject(new Error('Not connected'))
      }, 5000)

      this.once('connect', resolveSend)
    })
  }

  async send(methodOrPayload: string | JsonRpcPayload, callbackOrArgs?: JsonRpcCallback | JsonRpcParams) {
    if (typeof methodOrPayload === 'string' && (!callbackOrArgs || Array.isArray(callbackOrArgs))) {
      return this.doSend(methodOrPayload, callbackOrArgs as JsonRpcParams | undefined)
    }

    if (methodOrPayload && typeof methodOrPayload === 'object' && typeof callbackOrArgs === 'function') {
      return this.sendAsync(methodOrPayload, callbackOrArgs)
    }

    return this.request(methodOrPayload as JsonRpcPayload)
  }

  async subscribe(type: string, method: string, params: JsonRpcParams = []) {
    const id = (await this.doSend(type, [method, ...params])) as string
    this.subscriptions.push(id)
    return id
  }

  async unsubscribe(type: string, id: string) {
    const success = await this.doSend(type, [id])

    if (success) {
      this.subscriptions = this.subscriptions.filter((_id) => _id !== id)
      this.removeAllListeners(id)
      return success
    }
  }

  async sendAsync(rawPayload: JsonRpcPayload | JsonRpcPayload[], cb: JsonRpcCallback): Promise<void | Error>
  async sendAsync(rawPayload?: unknown, cb?: unknown): Promise<void | Error> {
    if (!isJsonRpcCallback(cb)) {
      return new Error('Invalid or undefined callback provided to sendAsync')
    }

    if (!isJsonRpcPayload(rawPayload) && !(Array.isArray(rawPayload) && rawPayload.every(isJsonRpcPayload))) {
      return cb(new Error('Invalid Payload'))
    }

    if (Array.isArray(rawPayload)) {
      return this.sendAsyncBatch(
        rawPayload.map((payload) => ({ ...payload, jsonrpc: '2.0' })),
        cb
      )
    }

    const payload = { ...rawPayload, jsonrpc: '2.0' as const }

    try {
      const result = await this.doSend(payload.method, payload.params, payload.chainId)
      cb(null, { id: payload.id, jsonrpc: payload.jsonrpc, result })
    } catch (e) {
      cb(e)
    }
  }

  isConnected() {
    return this.connected
  }

  close() {
    this.connection.close?.()
    this.off('connect', this.resumeSubscriptionsHandler)
    this.connected = false

    const error = new Error('Provider closed, subscription lost, please subscribe again.')
    this.subscriptions.forEach((id) => this.emit(id, error))
    this.subscriptions = []
    this.manualChainId = undefined
    this.providerChainId = undefined
    this.networkVersion = undefined
    this.selectedAddress = undefined
    this.coinbase = undefined
  }

  async request<T = unknown>(payload: JsonRpcPayload) {
    return this.doSend(payload.method, payload.params, payload.chainId) as Promise<T>
  }

  setChain(chainId: string | number) {
    const nextChainId = normalizeChainId(chainId)
    const chainChanged = nextChainId !== this.chainId

    this.manualChainId = nextChainId

    if (chainChanged) {
      this.emit('chainChanged', this.chainId)
    }
  }

  private async sendAsyncBatch(payloads: JsonRpcPayload[], cb: JsonRpcCallback<JsonRpcResponse[]>) {
    try {
      const results = await Promise.all(
        payloads.map((payload) => this.doSend(payload.method, payload.params, payload.chainId))
      )
      cb(
        null,
        results.map((result, index) => ({
          id: payloads[index]!.id,
          jsonrpc: payloads[index]!.jsonrpc,
          result
        }))
      )
    } catch (e) {
      cb(e)
    }
  }

  private handleNewListener(event: string | symbol) {
    if (typeof event !== 'string' || !(event in this.eventHandlers)) {
      return
    }

    if (!this.attemptedSubscriptions.has(event) && this.connected) {
      // Subscription setup catches and logs failures internally.
      void this.startSubscription(event as ProviderEvent)

      if (event === 'networkChanged') {
        console.warn('The networkChanged event is being deprecated, use chainChanged instead')
      }
    }
  }

  private async startSubscription(event: ProviderEvent) {
    console.debug(`starting subscription for ${event} events`)
    this.attemptedSubscriptions.add(event)

    try {
      const eventId = await this.subscribe('eth_subscribe', event)
      this.on(eventId, this.eventHandlers[event])
    } catch (e) {
      console.warn(`Unable to subscribe to ${event}`, e)
    }
  }

  private resumeSubscriptions() {
    ;(Object.keys(this.eventHandlers) as ProviderEvent[]).forEach((event) => {
      if (this.listenerCount(event) && !this.attemptedSubscriptions.has(event)) {
        // Subscription setup catches and logs failures internally.
        void this.startSubscription(event)
      }
    })
  }

  private handlePayload(payload: unknown) {
    if (isJsonRpcResponse(payload)) {
      const pending = this.promises[payload.id]
      if (!pending) {
        return
      }

      if (['eth_accounts', 'eth_requestAccounts'].includes(pending.method)) {
        const accounts = isStringArray(payload.result) ? payload.result : []
        this.accounts = accounts
        this.selectedAddress = accounts[0]
        this.coinbase = accounts[0]
      }

      if (payload.error) {
        pending.reject(payload.error)
      } else {
        pending.resolve(payload.result)
      }
      delete this.promises[payload.id]
      return
    }

    if (!isSubscriptionPayload(payload) || !payload.method.includes('_subscription')) {
      return
    }

    this.emit(payload.params.subscription, payload.params.result)
    this.emit(payload.method, payload.params)
    this.emit('message', {
      type: payload.method,
      data: {
        subscription: payload.params.subscription,
        result: payload.params.result
      }
    })
    this.emit('data', payload)
  }

  private handleClose() {
    this.connected = false
    this.attemptedSubscriptions.clear()
    this.emit('close')
    this.emit('disconnect')
  }
}
