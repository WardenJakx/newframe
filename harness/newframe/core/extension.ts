import { JsonRpcApiProvider, type JsonRpcError, type JsonRpcPayload, type JsonRpcResult } from 'ethers'

export const harnessExtensionId = 'newframe-harness-extension'

type RelayedResponse = { id: number; result?: unknown; error?: { code?: number; message?: string } }
type SubscriptionMessage = { method: 'eth_subscription'; params: { subscription: string; result: unknown } }

type PendingRequest = {
  resolve(response: RelayedResponse): void
  reject(error: Error): void
}

class RpcError extends Error {
  readonly code?: number

  constructor(message: string, code?: number) {
    super(message)
    this.code = code
  }
}

/** The ethers view of a dapp whose requests the harness extension relays. */
class RelayedDappProvider extends JsonRpcApiProvider {
  private readonly relay: (payload: JsonRpcPayload) => Promise<RelayedResponse>

  constructor(relay: (payload: JsonRpcPayload) => Promise<RelayedResponse>, chainId?: number) {
    super(chainId, { batchMaxCount: 1, pollingInterval: 250, ...(chainId ? { staticNetwork: true } : {}) })
    this.relay = relay
  }

  async _send(payload: JsonRpcPayload | JsonRpcPayload[]): Promise<Array<JsonRpcResult | JsonRpcError>> {
    return Promise.all(
      [payload].flat().map(async (request) => {
        const response = await this.relay(request)
        return response.error
          ? {
              id: request.id,
              error: { code: response.error.code ?? -32603, message: response.error.message ?? 'RPC error' }
            }
          : { id: request.id, result: response.result }
      })
    )
  }
}

/**
 * A minimal stand-in for the Newframe browser extension. Dapps can only reach Newframe through
 * the extension, so harness dapps relay their requests here. Like the real extension, this
 * connection carries the extension's browser origin, and each relayed request carries the dapp
 * origin the extension derives from the browser.
 */
export class HarnessExtension {
  private nextId = 1
  private readonly pending = new Map<number, PendingRequest>()
  private readonly subscriptions = new Map<string, (value: unknown) => void>()

  private readonly socket: WebSocket

  private constructor(socket: WebSocket) {
    this.socket = socket
    socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data)) as RelayedResponse | SubscriptionMessage
      if ('method' in message) {
        this.subscriptions.get(message.params.subscription)?.(message.params.result)
        return
      }
      const response = message
      const request = this.pending.get(response.id)
      this.pending.delete(response.id)
      request?.resolve(response)
    })
    socket.addEventListener('close', () => {
      for (const request of this.pending.values()) {
        request.reject(new Error('Harness extension connection closed'))
      }
      this.pending.clear()
    })
  }

  static async connect(newframeUrl: string) {
    const url = new URL(newframeUrl)
    url.protocol = 'ws:'
    url.search = '?identity=newframe-extension&scope=internal'
    // Node's WebSocket accepts headers, which lets the harness present the extension's browser origin.
    const socket = new WebSocket(url, {
      headers: { Origin: `chrome-extension://${harnessExtensionId}` }
    } as unknown as string[])
    await new Promise<void>((resolve, reject) => {
      socket.addEventListener('open', () => resolve(), { once: true })
      socket.addEventListener('error', () => reject(new Error('Harness extension could not connect')), {
        once: true
      })
    })
    return new HarnessExtension(socket)
  }

  private send(method: string, params: unknown, dappOrigin?: string, chainId?: number) {
    const id = this.nextId++
    return new Promise<RelayedResponse>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.socket.send(
        JSON.stringify({
          id,
          jsonrpc: '2.0',
          method,
          params,
          ...(chainId ? { chainId: `0x${chainId.toString(16)}` } : {}),
          ...(dappOrigin ? { __frameOrigin: dappOrigin } : {})
        })
      )
    })
  }

  private async result<T>(method: string, params: unknown, dappOrigin?: string): Promise<T> {
    const response = await this.send(method, params, dappOrigin)
    if (response.error) {
      throw new RpcError(response.error.message ?? 'RPC error', response.error.code)
    }
    return response.result as T
  }

  /** An operation the extension requests for itself, such as listing its shared accounts. */
  request<T = unknown>(method: string, params: unknown[] = []): Promise<T> {
    return this.result<T>(method, params)
  }

  /** The EIP-1193 provider the extension injects into a dapp. */
  eip1193(dappOrigin: string) {
    return {
      request: ({ method, params = [] }: { method: string; params?: readonly unknown[] }) =>
        this.result(method, params, dappOrigin),
      on: async (event: string, listener: (value: unknown) => void) => {
        const subscription = await this.result<string>('eth_subscribe', [event], dappOrigin)
        this.subscriptions.set(subscription, listener)
      }
    }
  }

  /** A provider for a dapp whose requests this extension relays. */
  dapp(dappOrigin: string, chainId?: number) {
    return new RelayedDappProvider(
      (payload) => this.send(payload.method, payload.params, dappOrigin, chainId),
      chainId
    )
  }

  close() {
    this.socket.close()
  }
}
