import {
  buildDappLauncherRoute,
  normalizeDappLauncherFrameRequest,
  parseDappLauncherHashRoute,
  resolveFlashAssetFromRouteAssetId,
  resolveSendAssetFromRouteAssetId,
  toCanonicalAssetId
} from '../../../../resources/domain/dappLauncher'
import {
  FLASH_DEFAULT_TARGET_ASSET,
  FLASH_NATIVE_ETH_ASSET,
  FLASH_USDC_ASSET,
  FLASH_WETH_ASSET
} from '../../../../resources/domain/flash'

describe('#parseDappLauncherHashRoute', () => {
  it('parses send routes', () => {
    const route = parseDappLauncherHashRoute(
      '#/send?assetId=31337:0x0000000000000000000000000000000000000000'
    )

    expect(route.name).toBe('send')
    expect(route.searchParams.get('assetId')).toBe('31337:0x0000000000000000000000000000000000000000')
  })

  it('parses trade routes', () => {
    const route = parseDappLauncherHashRoute(
      '#/trade?assetId=31337:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'
    )

    expect(route.name).toBe('trade')
    expect(route.searchParams.get('assetId')).toBe('31337:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2')
  })

  it('defaults unknown and malformed routes to send', () => {
    expect(parseDappLauncherHashRoute('').name).toBe('send')
    expect(parseDappLauncherHashRoute('#/unknown').name).toBe('send')
    expect(parseDappLauncherHashRoute('trade').name).toBe('send')
  })
})

describe('#normalizeDappLauncherFrameRequest', () => {
  it('accepts preferred frame objects with routes', () => {
    expect(
      normalizeDappLauncherFrameRequest({
        id: 'dappLauncher',
        route: '/trade?assetId=31337%3A0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'
      })
    ).toStrictEqual({
      id: 'dappLauncher',
      route: '/trade?assetId=31337%3A0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2'
    })
  })

  it('keeps deprecated string frame requests working', () => {
    expect(normalizeDappLauncherFrameRequest('dappLauncher')).toStrictEqual({ id: 'dappLauncher' })
  })

  it('rejects invalid frame requests', () => {
    expect(normalizeDappLauncherFrameRequest('')).toBeNull()
    expect(normalizeDappLauncherFrameRequest({ id: '' })).toBeNull()
  })
})

describe('#toCanonicalAssetId', () => {
  it('normalizes token route ids to chainId:lowercaseAddress', () => {
    expect(
      toCanonicalAssetId({
        chainId: 31337,
        address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
      })
    ).toBe('31337:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2')
  })

  it('normalizes native route ids to the zero-address sentinel', () => {
    expect(
      toCanonicalAssetId({
        chainId: 31337,
        address: '0x0000000000000000000000000000000000000000'
      })
    ).toBe('31337:0x0000000000000000000000000000000000000000')
  })

  it('returns empty string for invalid inputs', () => {
    expect(toCanonicalAssetId(null)).toBe('')
    expect(toCanonicalAssetId({ chainId: 0, address: FLASH_WETH_ASSET.address })).toBe('')
    expect(toCanonicalAssetId({ chainId: 31337, address: 'native-eth' })).toBe('')
  })
})

describe('#buildDappLauncherRoute', () => {
  it('encodes the asset id query param', () => {
    expect(buildDappLauncherRoute('send', '31337:0x0000000000000000000000000000000000000000')).toBe(
      '/send?assetId=31337%3A0x0000000000000000000000000000000000000000'
    )
  })
})

describe('#resolveSendAssetFromRouteAssetId', () => {
  const eth = {
    chainId: 31337,
    address: '0x0000000000000000000000000000000000000000',
    balance: '0xde0b6b3a7640000',
    symbol: 'ETH'
  }
  const weth = {
    chainId: 31337,
    address: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    balance: '0x0',
    symbol: 'WETH'
  }
  const usdc = {
    chainId: 31337,
    address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    balance: '1000000',
    symbol: 'USDC'
  }

  it('selects a positive sendable asset from the route id', () => {
    expect(
      resolveSendAssetFromRouteAssetId('31337:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', [eth, weth, usdc])
    ).toBe(usdc)
  })

  it('falls back when the route asset is missing, unsupported, or not sendable', () => {
    expect(
      resolveSendAssetFromRouteAssetId('31337:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', [eth, weth, usdc])
    ).toBe(eth)
    expect(
      resolveSendAssetFromRouteAssetId('1:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', [eth, usdc])
    ).toBe(eth)
    expect(resolveSendAssetFromRouteAssetId('not-valid', [eth, usdc])).toBe(eth)
  })

  it('returns null when no assets are sendable', () => {
    expect(
      resolveSendAssetFromRouteAssetId('31337:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2', [weth])
    ).toBeNull()
  })
})

describe('#resolveFlashAssetFromRouteAssetId', () => {
  it('resolves native sentinel ids to Flash native ETH', () => {
    expect(resolveFlashAssetFromRouteAssetId('31337:0x0000000000000000000000000000000000000000')).toBe(
      FLASH_NATIVE_ETH_ASSET
    )
  })

  it('resolves supported token ids', () => {
    expect(resolveFlashAssetFromRouteAssetId('31337:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')).toBe(
      FLASH_USDC_ASSET
    )
  })

  it('falls back for missing, invalid, or unsupported ids', () => {
    expect(resolveFlashAssetFromRouteAssetId()).toBe(FLASH_DEFAULT_TARGET_ASSET)
    expect(resolveFlashAssetFromRouteAssetId('31337:not-an-address')).toBe(FLASH_DEFAULT_TARGET_ASSET)
    expect(resolveFlashAssetFromRouteAssetId('1:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2')).toBe(
      FLASH_DEFAULT_TARGET_ASSET
    )
  })
})
