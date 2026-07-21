import log from 'electron-log'

import store from '../store'
import { getTokenDiscoveryProvider } from '../portfolio'
import { builtInChainIconUrl } from '../../resources/domain/chain'
import { toTokenId } from '../../resources/domain/token'
import { downloadImage } from './download'

import type { ChainMetadata, TokenRecord } from '../store/state'

const hydrating = new Set<string>()

function httpsImageUrl(value: unknown) {
  try {
    const url = new URL(String(value || '').trim())
    return url.protocol === 'https:' ? url.toString() : ''
  } catch {
    return ''
  }
}

async function hydrateToken(token: TokenRecord) {
  const tokenId = toTokenId(token)
  const sourceUrl = httpsImageUrl(token.logoURI)
  const hydrationId = `token:${tokenId}`
  if (!sourceUrl || token.image?.sourceUrl === sourceUrl || hydrating.has(hydrationId)) return

  hydrating.add(hydrationId)
  try {
    const image = await downloadImage(sourceUrl)
    const current = store.getState().main.tokens.byId[tokenId]
    if (httpsImageUrl(current?.logoURI) === sourceUrl) store.getState().setTokenImage(tokenId, image)
  } catch (error) {
    log.warn('Could not hydrate token image', { tokenId, sourceUrl, error })
  } finally {
    hydrating.delete(hydrationId)
  }
}

function configuredNetworkImageSource(chainId: number, metadata: ChainMetadata) {
  return httpsImageUrl(metadata.icon) || httpsImageUrl(builtInChainIconUrl(chainId))
}

async function networkImageSource(chainId: number, metadata: ChainMetadata) {
  const configured = configuredNetworkImageSource(chainId, metadata)
  if (configured) return configured

  const discovery = getTokenDiscoveryProvider()
  if (!discovery.ok) return ''
  return httpsImageUrl((await discovery.provider.getChainImage(chainId))?.url)
}

async function hydrateNetwork(chainId: number, metadata: ChainMetadata) {
  const hydrationId = `network:${chainId}`
  if (hydrating.has(hydrationId)) return

  hydrating.add(hydrationId)
  try {
    const sourceUrl = await networkImageSource(chainId, metadata)
    if (!sourceUrl || metadata.image?.sourceUrl === sourceUrl) return

    const image = await downloadImage(sourceUrl)
    const current = store.getState().main.networksMeta.ethereum[chainId]
    if (!current) return
    const currentSource = configuredNetworkImageSource(chainId, current)
    if (!currentSource || currentSource === sourceUrl) {
      store.getState().setNetworkImage('ethereum', chainId, sourceUrl, image)
    }
  } catch (error) {
    log.warn('Could not hydrate network image', { chainId, error })
  } finally {
    hydrating.delete(hydrationId)
  }
}

async function hydrateNativeCurrency(chainId: number, metadata: ChainMetadata) {
  const sourceUrl = httpsImageUrl(metadata.nativeCurrency.icon)
  const hydrationId = `native-currency:${chainId}`
  if (!sourceUrl || metadata.nativeCurrency.image?.sourceUrl === sourceUrl || hydrating.has(hydrationId)) return

  hydrating.add(hydrationId)
  try {
    const image = await downloadImage(sourceUrl)
    const current = store.getState().main.networksMeta.ethereum[chainId]?.nativeCurrency
    if (httpsImageUrl(current?.icon) === sourceUrl) {
      store.getState().setNativeCurrencyImage('ethereum', chainId, image)
    }
  } catch (error) {
    log.warn('Could not hydrate native currency image', { chainId, sourceUrl, error })
  } finally {
    hydrating.delete(hydrationId)
  }
}

function hydrateNetworks(networks: Record<number, ChainMetadata>) {
  Object.entries(networks).forEach(([id, metadata]) => {
    const chainId = Number(id)
    void hydrateNetwork(chainId, metadata)
    void hydrateNativeCurrency(chainId, metadata)
  })
}

function start() {
  const stopTokens = store.subscribe(
    (state) => state.main.tokens.byId,
    (tokens) => Object.values(tokens).forEach((token) => void hydrateToken(token)),
    { fireImmediately: true }
  )
  const stopNetworks = store.subscribe(
    (state) => state.main.networksMeta.ethereum,
    hydrateNetworks,
    { fireImmediately: true }
  )

  return () => {
    stopTokens()
    stopNetworks()
  }
}

export default { start }
