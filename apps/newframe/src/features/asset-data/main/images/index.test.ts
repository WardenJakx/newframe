import { beforeEach, expect, it, mock } from 'bun:test'

import { createImageService } from './index'

const downloadImage = mock()
const getTokenDiscoveryProvider = mock()
const getState = mock()
const subscribe = mock()

const imageFor = (sourceUrl: string) => ({
  base64: Buffer.from(sourceUrl).toString('base64'),
  contentHash: `hash:${sourceUrl}`,
  mimeType: 'image/png',
  sourceUrl
})

const flushHydration = () => new Promise((resolve) => setImmediate(resolve))
const startImages = () => {
  const images = createImageService({ getState, subscribe } as never, {
    downloadImage,
    getTokenDiscoveryProvider,
    log: { warn: mock() }
  })
  images.start()
  return images
}

beforeEach(() => {
  downloadImage.mockReset()
  downloadImage.mockImplementation(async (sourceUrl: string) => imageFor(sourceUrl))
  getTokenDiscoveryProvider.mockReset()
  getTokenDiscoveryProvider.mockReturnValue({ ok: false, error: 'missing_api_key' })
  getState.mockReset()
  subscribe.mockReset()
  subscribe.mockImplementation(() => mock())
})

it('hydrates networks in the background and tokens only when requested by the renderer', async () => {
  const token = {
    address: '0x1111111111111111111111111111111111111111',
    chainId: 1,
    decimals: 6,
    logoURI: 'https://cdn.example/token.png',
    name: 'Token',
    symbol: 'TKN'
  }
  const metadata = {
    gas: {},
    icon: 'https://cdn.example/network.png',
    nativeCurrency: {
      decimals: 18,
      icon: 'https://cdn.example/native.png',
      name: 'Ether',
      symbol: 'ETH'
    },
    primaryColor: 'accent1'
  }
  const state = {
    main: {
      origins: {},
      tokens: { byId: { [`1:${token.address}`]: token } },
      networksMeta: { ethereum: { 1: metadata } }
    },
    setNativeCurrencyImage: mock(),
    setNetworkImage: mock(),
    setTokenImage: mock()
  }
  getState.mockReturnValue(state)
  subscribe.mockImplementation(
    (selector: (value: typeof state) => unknown, listener: (value: any) => void) => {
      listener(selector(state))
      return mock()
    }
  )

  const images = startImages()
  await flushHydration()

  expect(state.setTokenImage).not.toHaveBeenCalled()
  images.requestTokenImage(`1:${token.address}`)
  await flushHydration()

  expect(state.setTokenImage).toHaveBeenCalledWith(`1:${token.address}`, imageFor(token.logoURI))
  expect(state.setNetworkImage).toHaveBeenCalledWith('ethereum', 1, metadata.icon, imageFor(metadata.icon))
  expect(state.setNativeCurrencyImage).toHaveBeenCalledWith(
    'ethereum',
    1,
    imageFor(metadata.nativeCurrency.icon)
  )
  expect(downloadImage).toHaveBeenCalledTimes(3)

  images.dispose()
})

it('does not download images that already match their configured sources', async () => {
  const sourceUrl = 'https://cdn.example/network.png'
  const state = {
    main: {
      origins: {},
      tokens: { byId: {} },
      networksMeta: {
        ethereum: {
          1: {
            gas: {},
            icon: sourceUrl,
            image: imageFor(sourceUrl),
            nativeCurrency: { decimals: 18, icon: '', name: 'Ether', symbol: 'ETH' },
            primaryColor: 'accent1'
          }
        }
      }
    },
    setNativeCurrencyImage: mock(),
    setNetworkImage: mock(),
    setTokenImage: mock()
  }
  getState.mockReturnValue(state)
  subscribe.mockImplementation(
    (selector: (value: typeof state) => unknown, listener: (value: any) => void) => {
      listener(selector(state))
      return mock()
    }
  )

  const images = startImages()
  await flushHydration()

  expect(downloadImage).not.toHaveBeenCalled()
  images.dispose()
})

it('limits concurrent image work even when many visible tokens request hydration together', async () => {
  const tokens = Object.fromEntries(
    Array.from({ length: 5 }, (_, index) => {
      const address = `0x${String(index + 1).padStart(40, '0')}`
      return [
        `1:${address}`,
        {
          address,
          chainId: 1,
          decimals: 18,
          logoURI: `https://cdn.example/token-${index}.png`,
          name: `Token ${index}`,
          symbol: `T${index}`
        }
      ]
    })
  )
  const state = {
    main: { origins: {}, tokens: { byId: tokens }, networksMeta: { ethereum: {} } },
    setNativeCurrencyImage: mock(),
    setNetworkImage: mock(),
    setTokenImage: mock()
  }
  getState.mockReturnValue(state)

  let active = 0
  let maxActive = 0
  const resolveDownloads: Array<() => void> = []
  downloadImage.mockImplementation(
    (sourceUrl: string) =>
      new Promise((resolve) => {
        active += 1
        maxActive = Math.max(maxActive, active)
        resolveDownloads.push(() => {
          active -= 1
          resolve(imageFor(sourceUrl))
        })
      })
  )

  const images = startImages()
  Object.keys(tokens).forEach(images.requestTokenImage)

  expect(downloadImage).toHaveBeenCalledTimes(2)
  resolveDownloads.shift()?.()
  await flushHydration()
  expect(downloadImage).toHaveBeenCalledTimes(3)

  while (state.setTokenImage.mock.calls.length < Object.keys(tokens).length) {
    resolveDownloads.splice(0).forEach((resolve) => resolve())
    await flushHydration()
  }

  expect(maxActive).toBe(2)
  expect(downloadImage).toHaveBeenCalledTimes(5)
  images.dispose()
})

it('hydrates changed origin favicons through the shared queue and discards stale and disposed results', async () => {
  const canonical = await createOriginImageStore()
  const downloads = new Map<string, (image: ReturnType<typeof imageFor>) => void>()
  const download = mock(
    (source: string) => new Promise<ReturnType<typeof imageFor>>((resolve) => downloads.set(source, resolve))
  )
  const images = createImageService(canonical, {
    downloadImage: download,
    getTokenDiscoveryProvider: () => ({ ok: false, error: 'missing_api_key' }),
    log: { warn: mock() }
  })
  canonical.getState().initOrigin('site', { name: 'site.test', chain: { id: 1, type: 'ethereum' } })
  const first = 'https://cdn.example/first.ico'
  const second = 'https://cdn.example/second.ico'
  const third = 'https://cdn.example/third.ico'
  canonical.getState().setOriginFavicon('site', first)
  images.start()
  canonical.getState().setOriginFavicon('site', second)
  downloads.get(first)?.(imageFor(first))
  await flushHydration()
  expect(canonical.getState().main.origins.site.image).toBeUndefined()
  downloads.get(second)?.(imageFor(second))
  await flushHydration()
  expect(canonical.getState().main.origins.site.image).toEqual(imageFor(second))
  canonical.getState().setOriginFavicon('site', third)
  images.dispose()
  downloads.get(third)?.(imageFor(third))
  await flushHydration()
  expect(canonical.getState().main.origins.site.image).toBeUndefined()
})

it('hydrates embedded Firefox origin favicons through the shared queue', async () => {
  const canonical = await createOriginImageStore()
  const source = 'data:image/png;base64,iVBORw0KGgoBAgM='
  const download = mock(async (sourceUrl: string) => imageFor(sourceUrl))
  canonical.getState().initOrigin('firefox-site', {
    name: 'firefox.test',
    chain: { id: 1, type: 'ethereum' }
  })
  canonical.getState().setOriginFavicon('firefox-site', source)

  const images = createImageService(canonical, {
    downloadImage: download,
    getTokenDiscoveryProvider: () => ({ ok: false, error: 'missing_api_key' }),
    log: { warn: mock() }
  })
  images.start()
  await flushHydration()

  expect(download).toHaveBeenCalledWith(source)
  expect(canonical.getState().main.origins['firefox-site']?.image).toEqual(imageFor(source))
  images.dispose()
})

async function createOriginImageStore() {
  const { createStore } = await import('zustand/vanilla')
  const { subscribeWithSelector } = await import('zustand/middleware')
  const { immer } = await import('zustand/middleware/immer')
  const { createCanonicalActions } = await import('../../../../platform/state-store/actions')
  const { default: createInitialState } = await import('../../../../platform/state-store/state')
  const canonical = createStore<import('../../../../platform/state-store/actions').CanonicalStore>()(
    subscribeWithSelector(
      immer((set, get) => ({ ...createInitialState(), ...createCanonicalActions(set, get) }))
    )
  )
  canonical.setState(({ main }) => ({
    main: { ...main, networksMeta: { ...main.networksMeta, ethereum: {} } }
  }))
  return canonical
}

it('retries failed origin images only when their source changes or the service restarts', async () => {
  const canonical = await createOriginImageStore()
  const download = mock(async (_source: string): Promise<ReturnType<typeof imageFor>> => {
    throw new Error('Unavailable favicon')
  })
  const images = createImageService(canonical, {
    downloadImage: download,
    getTokenDiscoveryProvider: () => ({ ok: false, error: 'missing_api_key' }),
    log: { warn: mock() }
  })
  const originIds = ['active', 'historical-a', 'historical-b']
  for (const id of originIds) {
    canonical.getState().initOrigin(id, { name: `${id}.test`, chain: { id: 1, type: 'ethereum' } })
    canonical.getState().setOriginFavicon(id, `https://cdn.example/${id}.ico`)
  }
  images.start()
  await flushHydration()
  expect(download).toHaveBeenCalledTimes(3)

  for (let count = 0; count < 5; count++) {
    canonical.getState().addOriginRequest('active')
    await flushHydration()
  }
  canonical.getState().initOrigin('unrelated', { name: 'unrelated.test', chain: { id: 1, type: 'ethereum' } })
  canonical
    .getState()
    .setOriginImage(
      'historical-a',
      'https://cdn.example/historical-a.ico',
      imageFor('https://cdn.example/historical-a.ico')
    )
  await flushHydration()
  expect(download).toHaveBeenCalledTimes(3)

  const changed = 'https://cdn.example/changed.ico'
  canonical.getState().setOriginFavicon('active', changed)
  await flushHydration()
  expect(download.mock.calls.map(([source]) => source)).toEqual([
    ...originIds.map((id) => `https://cdn.example/${id}.ico`),
    changed
  ])

  // Removing an origin leaves no retry state that could suppress its later reappearance.
  canonical.setState((state) => ({
    main: {
      ...state.main,
      origins: Object.fromEntries(Object.entries(state.main.origins).filter(([id]) => id !== 'historical-b'))
    }
  }))
  canonical.getState().initOrigin('historical-b', {
    name: 'historical-b.test',
    chain: { id: 1, type: 'ethereum' },
    faviconSource: 'https://cdn.example/historical-b.ico'
  })
  await flushHydration()
  expect(download).toHaveBeenCalledTimes(5)

  images.dispose()
  images.start()
  await flushHydration()
  expect(download).toHaveBeenCalledTimes(7)
  expect(download.mock.calls.slice(-2).map(([source]) => source)).toEqual([
    changed,
    'https://cdn.example/historical-b.ico'
  ])
  images.dispose()
})
