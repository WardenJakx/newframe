import { builtInChainIconUrl } from '../../domain/chain/index.js'
import { toTokenId } from '../../domain/token/index.js'

import type { getTokenDiscoveryProvider } from '../portfolio/index.js'
import type { CanonicalStoreReader } from '../store/actions.js'
import type { ChainMetadata, TokenRecord } from '../store/state/index.js'
import type { downloadImage } from './download.js'

const MAX_CONCURRENT_HYDRATIONS = 2

export interface ImageServiceAdapters {
  downloadImage: typeof downloadImage
  getTokenDiscoveryProvider: () => ReturnType<typeof getTokenDiscoveryProvider>
  log: { warn(message: string, details?: unknown): void }
}

export interface ImageService {
  start(): void
  requestTokenImage(tokenId: string): void
  dispose(): void
}

function httpsImageUrl(value: unknown) {
  try {
    const url = new URL(String(value || '').trim())
    return url.protocol === 'https:' ? url.toString() : ''
  } catch {
    return ''
  }
}

function configuredNetworkImageSource(chainId: number, metadata: ChainMetadata) {
  return httpsImageUrl(metadata.icon) || httpsImageUrl(builtInChainIconUrl(chainId))
}

export function createImageService(
  canonicalStore: CanonicalStoreReader,
  adapters: ImageServiceAdapters
): ImageService {
  const hydrating = new Set<string>()
  const queuedVisible = new Map<string, () => Promise<void>>()
  const queuedBackground = new Map<string, () => Promise<void>>()
  let activeHydrations = 0
  let active = false
  let unsubscribeNetworks: (() => void) | undefined

  const drainQueue = () => {
    if (!active) return

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

  const enqueueHydration = (
    hydrationId: string,
    hydrate: () => Promise<void>,
    priority: 'visible' | 'background'
  ) => {
    if (
      !active ||
      hydrating.has(hydrationId) ||
      queuedVisible.has(hydrationId) ||
      queuedBackground.has(hydrationId)
    ) {
      return
    }
    const queue = priority === 'visible' ? queuedVisible : queuedBackground
    queue.set(hydrationId, hydrate)
    drainQueue()
  }

  const hydrateToken = (token: TokenRecord) => {
    const tokenId = toTokenId(token)
    const sourceUrl = httpsImageUrl(token.logoURI)
    const hydrationId = `token:${tokenId}`
    if (!sourceUrl || token.image?.sourceUrl === sourceUrl) return

    enqueueHydration(
      hydrationId,
      async () => {
        try {
          const current = canonicalStore.getState().main.tokens.byId[tokenId]
          if (httpsImageUrl(current?.logoURI) !== sourceUrl || current.image?.sourceUrl === sourceUrl) return

          const image = await adapters.downloadImage(sourceUrl)
          if (!active) return
          const latest = canonicalStore.getState().main.tokens.byId[tokenId]
          if (httpsImageUrl(latest?.logoURI) === sourceUrl)
            canonicalStore.getState().setTokenImage(tokenId, image)
        } catch (error) {
          adapters.log.warn('Could not hydrate token image', { tokenId, sourceUrl, error })
        }
      },
      'visible'
    )
  }

  const requestTokenImage = (tokenId: string) => {
    const token = canonicalStore.getState().main.tokens.byId[tokenId]
    if (token) hydrateToken(token)
  }

  const networkImageSource = async (chainId: number, metadata: ChainMetadata) => {
    const configured = configuredNetworkImageSource(chainId, metadata)
    if (configured) return configured

    const discovery = adapters.getTokenDiscoveryProvider()
    if (!discovery.ok) return ''
    return httpsImageUrl((await discovery.provider.getChainImage(chainId))?.url)
  }

  const hydrateNetwork = (chainId: number, metadata: ChainMetadata) => {
    const hydrationId = `network:${chainId}`
    if (metadata.image?.sourceUrl === configuredNetworkImageSource(chainId, metadata)) return

    enqueueHydration(
      hydrationId,
      async () => {
        try {
          const sourceUrl = await networkImageSource(chainId, metadata)
          if (!sourceUrl || metadata.image?.sourceUrl === sourceUrl) return

          const image = await adapters.downloadImage(sourceUrl)
          if (!active) return
          const current = canonicalStore.getState().main.networksMeta.ethereum[chainId]
          if (!current) return
          const currentSource = configuredNetworkImageSource(chainId, current)
          if (!currentSource || currentSource === sourceUrl) {
            canonicalStore.getState().setNetworkImage('ethereum', chainId, sourceUrl, image)
          }
        } catch (error) {
          adapters.log.warn('Could not hydrate network image', { chainId, error })
        }
      },
      'background'
    )
  }

  const hydrateNativeCurrency = (chainId: number, metadata: ChainMetadata) => {
    const sourceUrl = httpsImageUrl(metadata.nativeCurrency.icon)
    const hydrationId = `native-currency:${chainId}`
    if (!sourceUrl || metadata.nativeCurrency.image?.sourceUrl === sourceUrl) return

    enqueueHydration(
      hydrationId,
      async () => {
        try {
          const current = canonicalStore.getState().main.networksMeta.ethereum[chainId]?.nativeCurrency
          if (httpsImageUrl(current?.icon) !== sourceUrl || current.image?.sourceUrl === sourceUrl) return

          const image = await adapters.downloadImage(sourceUrl)
          if (!active) return
          const latest = canonicalStore.getState().main.networksMeta.ethereum[chainId]?.nativeCurrency
          if (httpsImageUrl(latest?.icon) === sourceUrl) {
            canonicalStore.getState().setNativeCurrencyImage('ethereum', chainId, image)
          }
        } catch (error) {
          adapters.log.warn('Could not hydrate native currency image', { chainId, sourceUrl, error })
        }
      },
      'background'
    )
  }

  const hydrateNetworks = (networks: Record<number, ChainMetadata>) => {
    Object.entries(networks).forEach(([id, metadata]) => {
      const chainId = Number(id)
      void hydrateNetwork(chainId, metadata)
      void hydrateNativeCurrency(chainId, metadata)
    })
  }

  return {
    start() {
      if (active) return
      active = true
      unsubscribeNetworks = canonicalStore.subscribe(
        (state) => state.main.networksMeta.ethereum,
        hydrateNetworks,
        { fireImmediately: true }
      )
    },
    requestTokenImage,
    dispose() {
      if (!active) return
      active = false
      unsubscribeNetworks?.()
      unsubscribeNetworks = undefined
      queuedVisible.clear()
      queuedBackground.clear()
    }
  }
}
