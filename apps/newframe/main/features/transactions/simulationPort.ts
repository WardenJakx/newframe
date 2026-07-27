import type { TransactionRequest } from '../../../contracts/requests.js'
import type { TransactionSimulation } from '../../../domain/transaction/index.js'

export interface TransactionSimulationPort {
  simulateTransactionEffects(request: TransactionRequest): Promise<TransactionSimulation>
}

export function createDeferredTransactionSimulationPort() {
  let target: TransactionSimulationPort | undefined

  const port: TransactionSimulationPort = {
    simulateTransactionEffects: (request) => {
      if (!target) throw new Error('Transaction simulation capability is not connected')
      return target.simulateTransactionEffects(request)
    }
  }

  return {
    port,
    connect(next: TransactionSimulationPort) {
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
