import type {
  ChainsSnapshot,
  ChainsStatePort,
  LegacyChainMutations
} from '../../../core/services/chains/ports.ts'
import type { CanonicalStoreReader } from '../../../platform/state-store/actions.ts'
import type { CanonicalState } from '../../../platform/state-store/state/index.ts'

function chainSnapshot(main: CanonicalState['main']): ChainsSnapshot {
  return {
    chains: main.chains,
    chainsMeta: {
      ethereum: Object.fromEntries(
        Object.entries(main.chainsMeta.ethereum).map(([id, metadata]) => [id, { gas: metadata.gas }])
      )
    }
  }
}

export function createChainsStatePort(store: CanonicalStoreReader): ChainsStatePort {
  return {
    read: () => chainSnapshot(store.getState().main),
    subscribe: (selector, listener, options) =>
      store.subscribe((state) => selector(chainSnapshot(state.main)), listener, options),
    setPrimary: (type, chainId, update) => store.getState().setPrimary(type, chainId, update),
    setSecondary: (type, chainId, update) => store.getState().setSecondary(type, chainId, update),
    setGasPrices: (type, chainId, prices) => store.getState().setGasPrices(type, chainId, prices),
    setGasFees: (type, chainId, fees) => store.getState().setGasFees(type, chainId, fees),
    setGasDefault: (type, chainId, level) => store.getState().setGasDefault(type, chainId, level)
  }
}

export function createLegacyChainMutations(store: CanonicalStoreReader): LegacyChainMutations {
  return {
    remove: (chain) => store.getState().removeChain(chain),
    activate: (chainId, enabled) => store.getState().activateChain('ethereum', chainId, enabled),
    setPrimaryRpc: (chainId, url) => {
      const state = store.getState()
      state.setPrimaryCustom('ethereum', chainId, url)
      state.selectPrimary('ethereum', chainId, 'custom')
      state.toggleConnection('ethereum', chainId, 'primary', true)
    }
  }
}
