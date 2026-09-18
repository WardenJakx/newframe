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
      const networks = state.main.networks.ethereum as Record<
        number,
        (typeof state.main.networks.ethereum)[number] | undefined
      >
      const network = networks[chainId]
      if (!network || chainId === 1) {
        return false
      }
      state.removeNetwork(network)
      return true
    },

    async setPrimaryRpc(chainId: number, url: string) {
      const state = ports.store.getState()
      const networks = state.main.networks.ethereum as Record<
        number,
        (typeof state.main.networks.ethereum)[number] | undefined
      >
      if (!networks[chainId]) {
        return false
      }
      if (!(await ports.rpcMatchesChain(url, chainId))) {
        throw new Error('The RPC endpoint returned a different chain ID.')
      }

      state.setPrimaryCustom('ethereum', chainId, url)
      state.selectPrimary('ethereum', chainId, 'custom')
      state.toggleConnection('ethereum', chainId, 'primary', true)
      return true
    },

    setActivation(chainId: number, enabled: boolean) {
      const state = ports.store.getState()
      const networks = state.main.networks.ethereum as Record<
        number,
        (typeof state.main.networks.ethereum)[number] | undefined
      >
      if (!networks[chainId] || (chainId === 1 && !enabled)) {
        return false
      }
      state.activateNetwork('ethereum', chainId, enabled)
      return true
    }
  }
}

export type NetworkService = ReturnType<typeof createNetworkService>
