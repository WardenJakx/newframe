import log from 'electron-log'

import store from '../store'
import imageCache from '../imageCache'
import { getFlashAssetsForChain } from '../../resources/domain/flash/assets'
import { toTokenId } from '../../resources/domain/token'

import type { Token, TokenRecord } from '../store/state'

const hydrating = new Set<string>()

function hydrateToken(token: TokenRecord) {
  const tokenId = toTokenId(token)
  const sourceUrl = token.logoURI?.trim() || ''
  if (!sourceUrl.startsWith('https://')) return
  if (token.image?.sourceUrl === sourceUrl || hydrating.has(tokenId)) return

  hydrating.add(tokenId)
  void imageCache
    .downloadImage(sourceUrl)
    .then((image) => store.getState().setTokenImage(tokenId, image))
    .catch((error) => log.warn('Could not hydrate token image', { tokenId, sourceUrl, error }))
    .finally(() => hydrating.delete(tokenId))
}

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
  const state = store.getState()
  state.upsertTokens(bundledTokens(), { curated: true, source: 'bundled' })

  return store.subscribe(
    (current) => current.main.tokens.byId,
    (tokens) => Object.values(tokens).forEach(hydrateToken),
    { fireImmediately: true }
  )
}

export default { start }
