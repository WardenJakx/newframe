const downloadImage = jest.fn()
const getTokenDiscoveryProvider = jest.fn()
const getState = jest.fn()
const subscribe = jest.fn()

jest.mock('../../../main/images/download', () => ({ downloadImage }))
jest.mock('../../../main/portfolio', () => ({ getTokenDiscoveryProvider }))
jest.mock('../../../main/store', () => ({ default: { getState, subscribe } }))

const imageFor = (sourceUrl: string) => ({
  base64: Buffer.from(sourceUrl).toString('base64'),
  contentHash: `hash:${sourceUrl}`,
  mimeType: 'image/png',
  sourceUrl
})

const flushHydration = () => new Promise((resolve) => setImmediate(resolve))

beforeEach(() => {
  downloadImage.mockReset()
  downloadImage.mockImplementation(async (sourceUrl: string) => imageFor(sourceUrl))
  getTokenDiscoveryProvider.mockReset()
  getTokenDiscoveryProvider.mockReturnValue({ ok: false, error: 'missing_api_key' })
  getState.mockReset()
  subscribe.mockReset()
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
      symbol: 'ETH',
      usd: { change24hr: 0, price: 0 }
    },
    primaryColor: 'accent1'
  }
  const state = {
    main: {
      tokens: { byId: { [`1:${token.address}`]: token } },
      networksMeta: { ethereum: { 1: metadata } }
    },
    setNativeCurrencyImage: jest.fn(),
    setNetworkImage: jest.fn(),
    setTokenImage: jest.fn()
  }
  getState.mockReturnValue(state)
  subscribe.mockImplementation((selector: (value: typeof state) => unknown, listener: (value: any) => void) => {
    listener(selector(state))
    return jest.fn()
  })

  const images = await import('../../../main/images')
  const stop = images.default.start()
  await flushHydration()

  expect(state.setTokenImage).not.toHaveBeenCalled()
  images.requestTokenImage(`1:${token.address}`)
  await flushHydration()

  expect(state.setTokenImage).toHaveBeenCalledWith(`1:${token.address}`, imageFor(token.logoURI))
  expect(state.setNetworkImage).toHaveBeenCalledWith(
    'ethereum',
    1,
    metadata.icon,
    imageFor(metadata.icon)
  )
  expect(state.setNativeCurrencyImage).toHaveBeenCalledWith('ethereum', 1, imageFor(metadata.nativeCurrency.icon))
  expect(downloadImage).toHaveBeenCalledTimes(3)

  stop()
})

it('does not download images that already match their configured sources', async () => {
  const sourceUrl = 'https://cdn.example/network.png'
  const state = {
    main: {
      tokens: { byId: {} },
      networksMeta: {
        ethereum: {
          1: {
            gas: {},
            icon: sourceUrl,
            image: imageFor(sourceUrl),
            nativeCurrency: { decimals: 18, icon: '', name: 'Ether', symbol: 'ETH', usd: {} },
            primaryColor: 'accent1'
          }
        }
      }
    },
    setNativeCurrencyImage: jest.fn(),
    setNetworkImage: jest.fn(),
    setTokenImage: jest.fn()
  }
  getState.mockReturnValue(state)
  subscribe.mockImplementation((selector: (value: typeof state) => unknown, listener: (value: any) => void) => {
    listener(selector(state))
    return jest.fn()
  })

  const images = (await import('../../../main/images')).default
  const stop = images.start()
  await flushHydration()

  expect(downloadImage).not.toHaveBeenCalled()
  stop()
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
    main: { tokens: { byId: tokens }, networksMeta: { ethereum: {} } },
    setNativeCurrencyImage: jest.fn(),
    setNetworkImage: jest.fn(),
    setTokenImage: jest.fn()
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

  const { requestTokenImage } = await import('../../../main/images')
  Object.keys(tokens).forEach(requestTokenImage)

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
})
