import { EventEmitter } from 'events'
import { v5 as uuid } from 'uuid'

const internalOriginId = uuid('newframe-internal', uuid.DNS)

export class ProviderProxyConnection extends EventEmitter {
  private active = false
  private disposed = false

  get started() {
    return this.active
  }

  start() {
    if (this.active || this.disposed) return

    this.active = true
    process.nextTick(() => {
      if (this.active) this.emit('connect')
    })
  }

  async send(payload: JSONRPCRequestPayload) {
    if (!this.active) throw new Error('Provider proxy is not started.')

    if (payload.method === 'eth_subscribe') {
      this.emit('provider:subscribe', { ...payload, _origin: internalOriginId })
    } else {
      this.emit('provider:send', { ...payload, _origin: internalOriginId })
    }
  }

  close() {
    this.emit('close')
  }

  dispose() {
    if (this.disposed) return

    this.active = false
    this.disposed = true
    this.emit('close')
    this.removeAllListeners()
  }
}

export function createProviderProxyConnection() {
  return new ProviderProxyConnection()
}
