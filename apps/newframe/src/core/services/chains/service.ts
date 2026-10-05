import type { ChainsPorts, ChainsService, GatewayChainRpc } from './ports.ts'
import { createChainsRuntime } from './runtime.ts'

export function createChainsService(ports: ChainsPorts): {
  service: ChainsService
  gatewayRpc: GatewayChainRpc
} {
  const runtime = createChainsRuntime(ports.state, ports.internet)
  const service: ChainsService = {
    state: {
      get: (id) => ports.state.read().chains.ethereum[id],
      list: () => Object.values(ports.state.read().chains.ethereum)
    },
    hasConnection: (chain) => runtime.hasConnection(chain),
    isConnected: (chain) => runtime.isConnected(chain),
    transactionRules: (chain) => runtime.transactionRules(chain),
    refreshGasFees: (chain) => runtime.refreshGasFees(chain),
    estimateL1GasCost: (transaction) => runtime.estimateL1GasCost(transaction),
    read: (payload, respond, chain) => runtime.send(payload, respond, chain),
    on: (event, listener) => runtime.on(event, listener),
    off: (event, listener) => runtime.off(event, listener),
    once: (event, listener) => runtime.once(event, listener),
    start: () => runtime.start(),
    dispose: () => runtime.dispose(),
    rpcMatchesChain: (url, chainId) => ports.rpcMatchesChain(url, chainId),
    remove(chainId) {
      const chain = service.state.get(chainId)
      if (!chain || chainId === 1) {
        return false
      }
      ports.legacyMutations.remove(chain)
      return true
    },
    async setPrimaryRpc(chainId, url) {
      if (!service.state.get(chainId)) {
        return false
      }
      if (!(await ports.rpcMatchesChain(url, chainId))) {
        throw new Error('The RPC endpoint returned a different chain ID.')
      }
      ports.legacyMutations.setPrimaryRpc(chainId, url)
      return true
    },
    setActivation(chainId, enabled) {
      if (!service.state.get(chainId) || (chainId === 1 && !enabled)) {
        return false
      }
      ports.legacyMutations.activate(chainId, enabled)
      return true
    }
  }
  return { service, gatewayRpc: { send: (payload, respond, chain) => runtime.send(payload, respond, chain) } }
}
