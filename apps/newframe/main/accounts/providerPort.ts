import type { TrustedPrincipal } from '../authority.js'
import type { TransactionData } from '../../domain/transaction/index.js'

export interface AccountChainRpcPort {
  send(payload: RPCRequestPayload, respond: RPCRequestCallback, principal?: TrustedPrincipal): unknown
  sendAsync(payload: RPCRequestPayload, callback: Callback<RPCResponsePayload>): unknown
  getL1GasCost(transaction: TransactionData): Promise<bigint>
  on(event: string | symbol, listener: (...args: never[]) => void): unknown
  off(event: string | symbol, listener: (...args: never[]) => void): unknown
}

export function createDeferredAccountChainRpcPort() {
  let target: AccountChainRpcPort | undefined

  const getTarget = () => {
    if (!target) throw new Error('Account chain RPC capability is not connected')
    return target
  }

  const port: AccountChainRpcPort = {
    send: (payload, respond, principal) => getTarget().send(payload, respond, principal),
    sendAsync: (payload, callback) => getTarget().sendAsync(payload, callback),
    getL1GasCost: (transaction) => getTarget().getL1GasCost(transaction),
    on: (event, listener) => getTarget().on(event, listener),
    off: (event, listener) => getTarget().off(event, listener)
  }

  return {
    port,
    connect(next: AccountChainRpcPort) {
      const previous = target
      target = next
      let connected = true

      return () => {
        if (!connected) return
        connected = false
        if (target === next) target = previous
      }
    }
  }
}
