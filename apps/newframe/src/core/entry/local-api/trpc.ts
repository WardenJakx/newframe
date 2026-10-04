import { WalletRpcError } from '@newframe/desktop-api/router'

import type { RPCRequestCallback } from '../../../shared/domain/rpc.ts'

/** Adapt the gateway callback once, at the native tRPC boundary. */
export function rpcCall(send: (respond: RPCRequestCallback) => unknown): Promise<unknown> {
  return new Promise((resolve, reject) => {
    void Promise.resolve(
      send((response) => {
        if (response.error) {
          reject(new WalletRpcError(response.error))
        } else {
          resolve(response.result)
        }
      })
    ).catch(reject)
  })
}
