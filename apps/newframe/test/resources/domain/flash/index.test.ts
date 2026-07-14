import {
  FLASH_ANVIL_CHAIN_ID,
  FLASH_BASE_CHAIN_ID,
  FLASH_NATIVE_ETH_ASSET,
  FLASH_NATIVE_ETH_TOKEN_ADDRESS,
  FLASH_USDC_ASSET,
  FLASH_WETH_ASSET,
  balanceSummaryToFlashAsset,
  getDefaultContraAsset,
  getDefaultContraAssetForChain,
  getFlashChainSlug,
  getFlashDefaultChainId,
  getFlashSupportedChainIds,
  isFlashChainSupported,
  toFlashApiAssetAddress
} from '../../../../resources/domain/flash'

describe('flash domain helpers', () => {
  it('selects dev and production supported chain sets by runtime', () => {
    expect(getFlashSupportedChainIds({ profile: 'dev' })).toEqual([FLASH_ANVIL_CHAIN_ID])
    expect(isFlashChainSupported(FLASH_ANVIL_CHAIN_ID, { profile: 'dev' })).toBe(true)
    expect(isFlashChainSupported(1, { profile: 'dev' })).toBe(false)

    expect(getFlashSupportedChainIds({ profile: 'prod' })).toEqual([
      1,
      10,
      56,
      137,
      999,
      FLASH_BASE_CHAIN_ID,
      9745,
      81457,
      42161,
      43114,
      143
    ])
    expect(isFlashChainSupported(143, { profile: 'prod' })).toBe(true)
  })

  it('maps chain ids to Flash slugs and chooses supported defaults', () => {
    expect(getFlashChainSlug(1)).toBe('ethereum')
    expect(getFlashChainSlug(81457)).toBe('blast')
    expect(getFlashDefaultChainId({ profile: 'prod' }, [100, FLASH_BASE_CHAIN_ID, 1])).toBe(
      FLASH_BASE_CHAIN_ID
    )
    expect(getFlashDefaultChainId({ profile: 'dev' }, [1, FLASH_ANVIL_CHAIN_ID])).toBe(FLASH_ANVIL_CHAIN_ID)
  })

  it('converts balance summaries into canonical Flash assets', () => {
    const native = balanceSummaryToFlashAsset({
      address: FLASH_NATIVE_ETH_TOKEN_ADDRESS,
      balance: '1',
      chainId: FLASH_BASE_CHAIN_ID,
      decimals: 18,
      name: 'Ether',
      symbol: 'ETH'
    })
    const token = balanceSummaryToFlashAsset({
      address: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      balance: '1000000',
      chainId: 1,
      decimals: 6,
      name: 'USD Coin',
      symbol: 'USDC'
    })

    expect(native.id).toBe(`${FLASH_BASE_CHAIN_ID}:${FLASH_NATIVE_ETH_TOKEN_ADDRESS}`)
    expect(native.isNative).toBe(true)
    expect(toFlashApiAssetAddress(native)).toBe(FLASH_NATIVE_ETH_TOKEN_ADDRESS)
    expect(token.id).toBe('1:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48')
    expect(token.symbol).toBe('USDC')
  })

  it('uses the preferred balance priority for the default sell contra asset', () => {
    const targetAsset = {
      id: `${FLASH_ANVIL_CHAIN_ID}:0x0000000000000000000000000000000000000001`,
      symbol: 'TOKEN',
      name: 'Token',
      decimals: 18,
      chainId: FLASH_ANVIL_CHAIN_ID,
      isNative: false,
      address: '0x0000000000000000000000000000000000000001'
    }
    const otherAsset = {
      ...targetAsset,
      id: `${FLASH_ANVIL_CHAIN_ID}:0x0000000000000000000000000000000000000002`,
      symbol: 'OTHER',
      name: 'Other Token',
      address: '0x0000000000000000000000000000000000000002'
    }
    const assets = [FLASH_WETH_ASSET, targetAsset, otherAsset, FLASH_NATIVE_ETH_ASSET, FLASH_USDC_ASSET]

    expect(
      getDefaultContraAsset({
        assets,
        balances: [
          { assetId: FLASH_USDC_ASSET.id, balance: '1' },
          { assetId: FLASH_NATIVE_ETH_ASSET.id, balance: '1' },
          { assetId: FLASH_WETH_ASSET.id, balance: '1' }
        ],
        side: 'sell',
        targetAsset
      })
    ).toBe(FLASH_USDC_ASSET)

    expect(
      getDefaultContraAsset({
        assets,
        balances: [
          { assetId: FLASH_WETH_ASSET.id, balance: '1' },
          { assetId: FLASH_NATIVE_ETH_ASSET.id, balance: '1' }
        ],
        side: 'sell',
        targetAsset
      })
    ).toBe(FLASH_WETH_ASSET)
    expect(
      getDefaultContraAsset({
        assets,
        balances: [{ assetId: FLASH_NATIVE_ETH_ASSET.id, balance: '1' }],
        side: 'sell',
        targetAsset
      })
    ).toBe(FLASH_NATIVE_ETH_ASSET)
    expect(
      getDefaultContraAsset({
        assets,
        balances: [{ assetId: otherAsset.id, balance: '1' }],
        side: 'sell',
        targetAsset
      })
    ).toBe(FLASH_USDC_ASSET)
    expect(
      getDefaultContraAsset({
        assets,
        balances: [
          { assetId: FLASH_WETH_ASSET.id, balance: '1' },
          { assetId: FLASH_NATIVE_ETH_ASSET.id, balance: '1' }
        ],
        side: 'buy',
        targetAsset
      })
    ).toBe(FLASH_WETH_ASSET)
    expect(assets).toEqual([
      FLASH_WETH_ASSET,
      targetAsset,
      otherAsset,
      FLASH_NATIVE_ETH_ASSET,
      FLASH_USDC_ASSET
    ])
  })

  it('selects the initial contra asset before a target is known', () => {
    const assets = [FLASH_WETH_ASSET, FLASH_NATIVE_ETH_ASSET, FLASH_USDC_ASSET]

    expect(
      getDefaultContraAssetForChain({
        assets,
        balances: [
          { assetId: FLASH_USDC_ASSET.id, balance: '1' },
          { assetId: FLASH_WETH_ASSET.id, balance: '1' },
          { assetId: FLASH_NATIVE_ETH_ASSET.id, balance: '1' }
        ],
        chainId: FLASH_ANVIL_CHAIN_ID
      })
    ).toBe(FLASH_USDC_ASSET)
    expect(
      getDefaultContraAssetForChain({
        assets,
        balances: [
          { assetId: FLASH_WETH_ASSET.id, balance: '1' },
          { assetId: FLASH_NATIVE_ETH_ASSET.id, balance: '1' }
        ],
        chainId: FLASH_ANVIL_CHAIN_ID
      })
    ).toBe(FLASH_WETH_ASSET)
  })
})
