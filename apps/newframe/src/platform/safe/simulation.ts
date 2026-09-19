import type { Chains } from '../../features/networks/main/index.js'
import { createOneResultCallbackBoundary } from '../callbacks/oneResult.js'
import type { Erc20ProviderPort } from '../chain-rpc/contracts/erc20.js'

type SafeReadMethod =
  | 'eth_call'
  | 'eth_chainId'
  | 'eth_getBlockByNumber'
  | 'eth_getBalance'
  | 'eth_getStorageAt'
  | 'eth_gasPrice'
  | 'debug_traceCall'
export type SafeStateOverrides = Record<string, { balance?: string; stateDiff?: Record<string, string> }>
export interface SafeSimulationRpc {
  request(chainId: number, method: SafeReadMethod, params: unknown[], signal?: AbortSignal): Promise<unknown>
  call(
    chainId: number,
    address: string,
    data: string,
    blockTag?: string,
    signal?: AbortSignal,
    overrides?: SafeStateOverrides
  ): Promise<string>
  metadataProvider?(chainId: number, blockTag: string, signal?: AbortSignal): Erc20ProviderPort
}
const readMethods = new Set<SafeReadMethod>([
  'eth_call',
  'eth_chainId',
  'eth_getBlockByNumber',
  'eth_getBalance',
  'eth_getStorageAt',
  'eth_gasPrice',
  'debug_traceCall'
])

export function createSafeSimulationRpc(
  chains: Pick<Chains, 'send'>,
  { timeoutMs = 15_000 }: { timeoutMs?: number } = {}
): SafeSimulationRpc & { dispose(): void } {
  const callbacks = createOneResultCallbackBoundary()
  const request: SafeSimulationRpc['request'] = (chainId, method, params, signal) => {
    if (!Number.isSafeInteger(chainId) || chainId <= 0 || !readMethods.has(method)) {
      return Promise.reject(new Error('Invalid Safe simulation read'))
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    let abort: (() => void) | undefined
    return callbacks
      .run<unknown>((done) => {
        abort = () => done(signal?.reason ?? new Error('Safe simulation cancelled'))
        if (signal?.aborted) {
          return abort()
        }
        signal?.addEventListener('abort', abort, { once: true })
        timer = setTimeout(() => done(new Error('Safe simulation RPC timed out')), timeoutMs)
        chains.send(
          { id: crypto.randomUUID(), jsonrpc: '2.0', method, params },
          (response) => {
            if (response?.error) {
              done(new Error(response.error.message || 'Safe simulation RPC failed'))
            } else {
              done(null, response?.result)
            }
          },
          { type: 'ethereum', id: chainId }
        )
      })
      .finally(() => {
        clearTimeout(timer)
        if (abort) {
          signal?.removeEventListener('abort', abort)
        }
      })
  }
  return {
    request,
    async call(chainId, address, data, blockTag = 'latest', signal, overrides) {
      const params: unknown[] = [{ to: address, data }, blockTag]
      if (overrides) {
        params.push(overrides)
      }
      const result = await request(chainId, 'eth_call', params, signal)
      if (typeof result !== 'string' || !/^0x(?:[0-9a-f]{2})*$/i.test(result)) {
        throw new Error('Invalid Safe contract response')
      }
      return result
    },
    metadataProvider(chainId, blockTag, signal) {
      return {
        sendAsync(payload, callback) {
          if (payload.method !== 'eth_call' && payload.method !== 'eth_chainId') {
            callback(new Error('Unsupported token metadata read'))
            return
          }
          const params = payload.method === 'eth_call' ? [payload.params?.[0], blockTag] : []
          void request(chainId, payload.method, params, signal).then(
            (result) => callback(null, { id: payload.id, jsonrpc: '2.0', result }),
            (error: unknown) => callback(error instanceof Error ? error : new Error(String(error)))
          )
        }
      }
    },
    dispose: () => callbacks.dispose()
  }
}
