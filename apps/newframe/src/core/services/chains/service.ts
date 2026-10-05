import type { CanonicalStore } from '../../../platform/state-store/actions.ts'

type ChainState = Pick<
  CanonicalStore,
  'activateChain' | 'main' | 'removeChain' | 'selectPrimary' | 'setPrimaryCustom' | 'toggleConnection'
>

export interface ChainServicePorts {
  rpcMatchesChain(url: unknown, chainId: number): Promise<boolean>
  store: { getState(): ChainState }
}

export function createChainService(ports: ChainServicePorts) {
  return {
    remove(chainId: number) {
      const state = ports.store.getState()
      const chains = state.main.chains.ethereum as Record<
        number,
        (typeof state.main.chains.ethereum)[number] | undefined
      >
      const chain = chains[chainId]
      if (!chain || chainId === 1) {
        return false
      }
      state.removeChain(chain)
      return true
    },

    async setPrimaryRpc(chainId: number, url: string) {
      const state = ports.store.getState()
      const chains = state.main.chains.ethereum as Record<
        number,
        (typeof state.main.chains.ethereum)[number] | undefined
      >
      if (!chains[chainId]) {
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
      const chains = state.main.chains.ethereum as Record<
        number,
        (typeof state.main.chains.ethereum)[number] | undefined
      >
      if (!chains[chainId] || (chainId === 1 && !enabled)) {
        return false
      }
      state.activateChain('ethereum', chainId, enabled)
      return true
    }
  }
}

export type ChainService = ReturnType<typeof createChainService>
