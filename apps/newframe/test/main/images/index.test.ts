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

it('hydrates token, network, and native-currency images entirely in the main process', async () => {
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

  const images = (await import('../../../main/images')).default
  const stop = images.start()
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
