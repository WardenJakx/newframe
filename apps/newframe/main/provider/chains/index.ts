import { isDeepStrictEqual } from 'util'

import { getColor } from '../../../resources/colors'
import store from '../../store'

import type { Chain, ChainMetadata, Origin } from '../../store/state'

// typed access to state
const storeApi = {
  getCurrentOrigins: (): Record<string, Origin> => {
    return store.getState().main.origins
  },
  getChains: (): Record<string, Chain> => {
    return store.getState().main.networks.ethereum || {}
  },
  getChainsMeta: (): Record<string, ChainMetadata> => {
    return store.getState().main.networksMeta.ethereum || {}
  }
}

interface ChainsChangedHandler {
  chainsChanged: (address: Address, chains: RPC.GetEthereumChains.Chain[]) => void
}

interface ChainChangedHandler {
  chainChanged: (chainId: number, originId: string) => void
}

interface NetworkChangedHandler {
  networkChanged: (networkId: number, originId: string) => void
}

function createChainsObserver(handler: ChainsChangedHandler) {
  let availableChains = getActiveChains()

  return function () {
    const currentChains = getActiveChains()

    if (!isDeepStrictEqual(currentChains, availableChains)) {
      availableChains = currentChains

      setTimeout(() => {
        const currentAccount = store.getState().main.currentAccount as string
        handler.chainsChanged(currentAccount, availableChains)
      }, 0)
    }
  }
}

function createOriginChainObserver(handler: ChainChangedHandler & NetworkChangedHandler) {
  const knownOrigins: Record<string, Origin> = {}

  return function () {
    const currentOrigins = storeApi.getCurrentOrigins()

    for (const originId in currentOrigins) {
      const currentOrigin = currentOrigins[originId]
      const knownOrigin = knownOrigins[originId]

      if (knownOrigin && knownOrigin.chain.id !== currentOrigin.chain.id) {
        handler.chainChanged(currentOrigin.chain.id, originId)
        handler.networkChanged(currentOrigin.chain.id, originId)
      }

      knownOrigins[originId] = currentOrigin
    }
  }
}

function getActiveChains(): RPC.GetEthereumChains.Chain[] {
  const chains = storeApi.getChains()
  const meta = storeApi.getChainsMeta()

  return Object.values(chains)
    .filter((chain) => chain.on)
    .sort((a, b) => a.id - b.id)
    .map((chain) => {
      const { id, explorer, name } = chain
      const { nativeCurrency, primaryColor } = meta[id]
      const { icon: currencyIcon, name: currencyName, symbol, decimals } = nativeCurrency

      const icons = currencyIcon ? [{ url: currencyIcon }] : []
      const colors = primaryColor ? [getColor(primaryColor)] : []

      return {
        chainId: id,
        networkId: id,
        name,
        connected: chain.connection.primary.connected || chain.connection.secondary.connected,
        nativeCurrency: {
          name: currencyName,
          symbol,
          decimals
        },
        icon: icons,
        explorers: [{ url: explorer }],
        external: {
          wallet: { colors }
        }
      }
    })
}

export { getActiveChains, createChainsObserver, createOriginChainObserver }
