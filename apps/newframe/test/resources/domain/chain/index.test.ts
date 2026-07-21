import { BUILT_IN_CHAIN_ICON_URLS, builtInChainIconUrl } from '../../../../resources/domain/chain'

describe('built-in chain configuration', () => {
  it('provides HTTPS artwork for every built-in production chain', () => {
    const productionChainIds = [1, 10, 56, 100, 137, 143, 999, 8453, 9745, 42161, 43114, 81457]

    productionChainIds.forEach((chainId) => {
      expect(builtInChainIconUrl(chainId).startsWith('https://')).toBe(true)
    })
  })

  it('does not invent artwork for unknown chains', () => {
    expect(builtInChainIconUrl(31337)).toBe('')
    expect(Object.isFrozen(BUILT_IN_CHAIN_ICON_URLS)).toBe(true)
  })
})
