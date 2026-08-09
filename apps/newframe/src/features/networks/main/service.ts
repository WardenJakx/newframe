import type { CanonicalStore } from '../../../platform/state-store/actions.js'

type NetworkState = Pick<
  CanonicalStore,
  'activateNetwork' | 'main' | 'removeNetwork' | 'selectPrimary' | 'setPrimaryCustom' | 'toggleConnection'
>

export interface NetworkServicePorts {
  rpcMatchesChain(url: unknown, chainId: number): Promise<boolean>
  store: { getState(): NetworkState }
}

export function createNetworkService(ports: NetworkServicePorts) {
  return {
    remove(chainId: number) {
      const state = ports.store.getState()
      const network = state.main.networks.ethereum[chainId]
      if (!network || chainId === 1) return false
      state.removeNetwork(network)
      return true
    },

    async setPrimaryRpc(chainId: number, url: string) {
      if (!ports.store.getState().main.networks.ethereum[chainId]) return false
      if (!(await ports.rpcMatchesChain(url, chainId))) {
        throw new Error('The RPC endpoint returned a different chain ID.')
      }

      const state = ports.store.getState()
      state.setPrimaryCustom('ethereum', chainId, url)
      state.selectPrimary('ethereum', chainId, 'custom')
      state.toggleConnection('ethereum', chainId, 'primary', true)
      return true
    },

    setActivation(chainId: number, enabled: boolean) {
      if (!ports.store.getState().main.networks.ethereum[chainId] || (chainId === 1 && !enabled)) {
        return false
      }
      ports.store.getState().activateNetwork('ethereum', chainId, enabled)
      return true
    }
  }
}

export type NetworkService = ReturnType<typeof createNetworkService>
