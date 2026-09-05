import { describe, expect, it, mock } from 'bun:test'

import { createChainlistIconLookup } from './production'

describe('Chainlist icon lookup', () => {
  it('resolves chain slugs to the icon URL used by Chainlist and caches the catalog', async () => {
    const fetchCatalog = mock(async (_url: string, _init: RequestInit) => ({
      ok: true,
      json: async () => [
        { chainId: 1, chainSlug: 'ethereum' },
        { chainId: 137, chainSlug: 'polygon' }
      ]
    }))
    const lookup = createChainlistIconLookup(fetchCatalog)

    await expect(lookup(137)).resolves.toBe('https://icons.llamao.fi/icons/chains/rsz_polygon.jpg')
    await expect(lookup(1)).resolves.toBe('https://icons.llamao.fi/icons/chains/rsz_ethereum.jpg')
    expect(fetchCatalog).toHaveBeenCalledTimes(1)
    expect(fetchCatalog.mock.calls[0][0]).toBe('https://chainlist.org/rpcs.json')
  })

  it('falls back to the catalog icon name and ignores failed lookups', async () => {
    const fetchCatalog = mock(async (_url: string, _init: RequestInit) => ({
      ok: true,
      json: async () => [{ chainId: 10, icon: 'optimism' }]
    }))
    const lookup = createChainlistIconLookup(fetchCatalog)

    await expect(lookup(10)).resolves.toBe('https://icons.llamao.fi/icons/chains/rsz_optimism.jpg')
    await expect(lookup(999_999)).resolves.toBe('')
  })
})
