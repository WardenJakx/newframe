import log from 'electron-log'

import store from '../store'
import { getTokenDiscoveryProvider } from '../portfolio'
import { builtInChainIconUrl } from '../../resources/domain/chain'
import { toTokenId } from '../../resources/domain/token'
import { downloadImage } from './download'

import type { ChainMetadata, TokenRecord } from '../store/state'

const MAX_CONCURRENT_HYDRATIONS = 2
const hydrating = new Set<string>()
const queuedVisible = new Map<string, () => Promise<void>>()
const queuedBackground = new Map<string, () => Promise<void>>()
let activeHydrations = 0

function drainQueue() {
  while (activeHydrations < MAX_CONCURRENT_HYDRATIONS && (queuedVisible.size || queuedBackground.size)) {
    const queue = queuedVisible.size ? queuedVisible : queuedBackground
    const next = queue.entries().next().value as [string, () => Promise<void>]
    const [hydrationId, hydrate] = next
    queue.delete(hydrationId)
    hydrating.add(hydrationId)
    activeHydrations += 1

    void hydrate().finally(() => {
      activeHydrations -= 1
      hydrating.delete(hydrationId)
      drainQueue()
    })
  }
}

function enqueueHydration(
  hydrationId: string,
  hydrate: () => Promise<void>,
  priority: 'visible' | 'background'
) {
  if (hydrating.has(hydrationId) || queuedVisible.has(hydrationId) || queuedBackground.has(hydrationId)) {
    return
  }
  const queue = priority === 'visible' ? queuedVisible : queuedBackground
  queue.set(hydrationId, hydrate)
  drainQueue()
}

function httpsImageUrl(value: unknown) {
  try {
    const url = new URL(String(value || '').trim())
    return url.protocol === 'https:' ? url.toString() : ''
  } catch {
    return ''
  }
}

function hydrateToken(token: TokenRecord) {
  const tokenId = toTokenId(token)
  const sourceUrl = httpsImageUrl(token.logoURI)
  const hydrationId = `token:${tokenId}`
  if (!sourceUrl || token.image?.sourceUrl === sourceUrl) return

  enqueueHydration(hydrationId, async () => {
    try {
      const current = store.getState().main.tokens.byId[tokenId]
      if (httpsImageUrl(current?.logoURI) !== sourceUrl || current.image?.sourceUrl === sourceUrl) return

      const image = await downloadImage(sourceUrl)
      const latest = store.getState().main.tokens.byId[tokenId]
      if (httpsImageUrl(latest?.logoURI) === sourceUrl) store.getState().setTokenImage(tokenId, image)
    } catch (error) {
      log.warn('Could not hydrate token image', { tokenId, sourceUrl, error })
    }
  }, 'visible')
}

export function requestTokenImage(tokenId: string) {
  const token = store.getState().main.tokens.byId[tokenId]
  if (!token) return
  hydrateToken(token)
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

function hydrateNetwork(chainId: number, metadata: ChainMetadata) {
  const hydrationId = `network:${chainId}`
  if (metadata.image?.sourceUrl === configuredNetworkImageSource(chainId, metadata)) return

  enqueueHydration(hydrationId, async () => {
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
    }
  }, 'background')
}

function hydrateNativeCurrency(chainId: number, metadata: ChainMetadata) {
  const sourceUrl = httpsImageUrl(metadata.nativeCurrency.icon)
  const hydrationId = `native-currency:${chainId}`
  if (!sourceUrl || metadata.nativeCurrency.image?.sourceUrl === sourceUrl) return

  enqueueHydration(hydrationId, async () => {
    try {
      const current = store.getState().main.networksMeta.ethereum[chainId]?.nativeCurrency
      if (httpsImageUrl(current?.icon) !== sourceUrl || current.image?.sourceUrl === sourceUrl) return

      const image = await downloadImage(sourceUrl)
      const latest = store.getState().main.networksMeta.ethereum[chainId]?.nativeCurrency
      if (httpsImageUrl(latest?.icon) === sourceUrl) {
        store.getState().setNativeCurrencyImage('ethereum', chainId, image)
      }
    } catch (error) {
      log.warn('Could not hydrate native currency image', { chainId, sourceUrl, error })
    }
  }, 'background')
}

function hydrateNetworks(networks: Record<number, ChainMetadata>) {
  Object.entries(networks).forEach(([id, metadata]) => {
    const chainId = Number(id)
    void hydrateNetwork(chainId, metadata)
    void hydrateNativeCurrency(chainId, metadata)
  })
}

function start() {
  const stopNetworks = store.subscribe(
    (state) => state.main.networksMeta.ethereum,
    hydrateNetworks,
    { fireImmediately: true }
  )

  return () => {
    stopNetworks()
  }
}

export default { start }
