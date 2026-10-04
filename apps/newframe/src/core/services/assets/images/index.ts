import { embeddedImageSource } from '../../../../features/asset-data/domain/image/index.ts'
import { builtInChainIconUrl } from '../../../../features/chains/domain/chain/index.ts'
import type { Origin } from '../../../../features/connections/domain/state/origin.ts'
import { toTokenId } from '../../../../features/tokens/domain/index.ts'
import type { CanonicalStoreReader } from '../../../../platform/state-store/actions.ts'
import type { ChainMetadata, TokenRecord } from '../../../../platform/state-store/state/index.ts'
import type { getTokenDiscoveryProvider } from '../portfolio/index.ts'
import type { downloadImage } from './download.ts'

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
  if (typeof value !== 'string') {
    return ''
  }

  try {
    const url = new URL(value.trim())
    return url.protocol === 'https:' ? url.toString() : ''
  } catch {
    return ''
  }
}

function originImageSource(value: unknown) {
  return httpsImageUrl(value) || embeddedImageSource(value)
}

function configuredChainImageSource(chainId: number, metadata: ChainMetadata) {
  return (
    httpsImageUrl(metadata.icon) ||
    embeddedImageSource(metadata.icon) ||
    httpsImageUrl(builtInChainIconUrl(chainId))
  )
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
  let unsubscribeOrigins: (() => void) | undefined
  let unsubscribeChains: (() => void) | undefined
  const tokenById = (tokenId: string) => {
    const tokens = canonicalStore.getState().main.tokens.byId as Record<string, TokenRecord | undefined>
    return tokens[tokenId]
  }
  const chainMetadata = (chainId: number) => {
    const metadata = canonicalStore.getState().main.chainsMeta.ethereum as Record<
      number,
      ChainMetadata | undefined
    >
    return metadata[chainId]
  }
  const originById = (originId: string) => {
    const origins = canonicalStore.getState().main.origins as Record<string, Origin | undefined>
    return origins[originId]
  }

  const drainQueue = () => {
    if (!active) {
      return
    }

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
    if (!sourceUrl || token.image?.sourceUrl === sourceUrl) {
      return
    }

    enqueueHydration(
      hydrationId,
      async () => {
        try {
          const current = tokenById(tokenId)
          if (httpsImageUrl(current?.logoURI) !== sourceUrl || current?.image?.sourceUrl === sourceUrl) {
            return
          }

          const image = await adapters.downloadImage(sourceUrl)
          if (!active) {
            return
          }
          const latest = tokenById(tokenId)
          if (httpsImageUrl(latest?.logoURI) === sourceUrl) {
            canonicalStore.getState().setTokenImage(tokenId, image)
          }
        } catch (error) {
          adapters.log.warn('Could not hydrate token image', { tokenId, sourceUrl, error })
        }
      },
      'visible'
    )
  }

  const requestTokenImage = (tokenId: string) => {
    const token = tokenById(tokenId)
    if (token) {
      hydrateToken(token)
    }
  }

  const chainImageSource = async (chainId: number, metadata: ChainMetadata) => {
    const configured = configuredChainImageSource(chainId, metadata)
    if (configured) {
      return configured
    }

    const discovery = adapters.getTokenDiscoveryProvider()
    if (!discovery.ok) {
      return ''
    }
    return httpsImageUrl((await discovery.provider.getChainImage(chainId))?.url)
  }

  const hydrateChain = (chainId: number, metadata: ChainMetadata) => {
    const hydrationId = `chain:${chainId}`
    if (metadata.image?.sourceUrl === configuredChainImageSource(chainId, metadata)) {
      return
    }

    enqueueHydration(
      hydrationId,
      async () => {
        try {
          const sourceUrl = await chainImageSource(chainId, metadata)
          if (!sourceUrl || metadata.image?.sourceUrl === sourceUrl) {
            return
          }

          const image = await adapters.downloadImage(sourceUrl)
          if (!active) {
            return
          }
          const current = chainMetadata(chainId)
          if (!current) {
            return
          }
          const currentSource = configuredChainImageSource(chainId, current)
          if (!currentSource || currentSource === sourceUrl) {
            canonicalStore.getState().setChainImage('ethereum', chainId, sourceUrl, image)
          }
        } catch (error) {
          adapters.log.warn('Could not hydrate chain image', { chainId, error })
        }
      },
      'background'
    )
  }

  const hydrateNativeCurrency = (chainId: number, metadata: ChainMetadata) => {
    const sourceUrl = httpsImageUrl(metadata.nativeCurrency.icon)
    const hydrationId = `native-currency:${chainId}`
    if (!sourceUrl || metadata.nativeCurrency.image?.sourceUrl === sourceUrl) {
      return
    }

    enqueueHydration(
      hydrationId,
      async () => {
        try {
          const current = chainMetadata(chainId)?.nativeCurrency
          if (httpsImageUrl(current?.icon) !== sourceUrl || current?.image?.sourceUrl === sourceUrl) {
            return
          }

          const image = await adapters.downloadImage(sourceUrl)
          if (!active) {
            return
          }
          const latest = chainMetadata(chainId)?.nativeCurrency
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

  const hydrateOrigins = (
    origins: Record<string, Origin>,
    previousOrigins: Record<string, Origin | undefined> = {}
  ) => {
    for (const [originId, origin] of Object.entries(origins)) {
      const sourceUrl = originImageSource(origin.faviconSource)
      if (
        !sourceUrl ||
        sourceUrl === originImageSource(previousOrigins[originId]?.faviconSource) ||
        origin.image?.sourceUrl === sourceUrl
      ) {
        continue
      }
      enqueueHydration(
        `origin:${originId}:${sourceUrl}`,
        async () => {
          try {
            const current = originById(originId)
            if (current?.faviconSource !== sourceUrl || current.image?.sourceUrl === sourceUrl) {
              return
            }
            const image = await adapters.downloadImage(sourceUrl)
            if (active) {
              canonicalStore.getState().setOriginImage(originId, sourceUrl, image)
            }
          } catch (error) {
            adapters.log.warn('Could not hydrate origin image', { originId, sourceUrl, error })
          }
        },
        'visible'
      )
    }
  }

  const hydrateChains = (chains: Record<number, ChainMetadata>) => {
    Object.entries(chains).forEach(([id, metadata]) => {
      const chainId = Number(id)
      void hydrateChain(chainId, metadata)
      void hydrateNativeCurrency(chainId, metadata)
    })
  }

  return {
    start() {
      if (active) {
        return
      }
      active = true
      unsubscribeOrigins = canonicalStore.subscribe((state) => state.main.origins, hydrateOrigins)
      hydrateOrigins(canonicalStore.getState().main.origins)
      unsubscribeChains = canonicalStore.subscribe((state) => state.main.chainsMeta.ethereum, hydrateChains, {
        fireImmediately: true
      })
    },
    requestTokenImage,
    dispose() {
      if (!active) {
        return
      }
      active = false
      unsubscribeOrigins?.()
      unsubscribeOrigins = undefined
      unsubscribeChains?.()
      unsubscribeChains = undefined
      queuedVisible.clear()
      queuedBackground.clear()
    }
  }
}
