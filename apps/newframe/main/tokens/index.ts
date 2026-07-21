import store from '../store'
import { getFlashAssetsForChain } from '../../resources/domain/flash/assets'

import type { Token } from '../store/state'

function bundledTokens(): Token[] {
  const networks = Object.values(store.getState().main.networks.ethereum)
  return networks.flatMap((network) =>
    getFlashAssetsForChain(network.id)
      .filter((asset) => !asset.isNative)
      .map((asset) => ({
        address: asset.address,
        chainId: asset.chainId,
        decimals: asset.decimals,
        name: asset.name,
        symbol: asset.symbol
      }))
  )
}

function start() {
  store.getState().upsertTokens(bundledTokens(), { curated: true, source: 'bundled' })
}

export default { start }
