import { describe, expect, it, mock } from 'bun:test'

import { createChainlistIconLookup } from './production.ts'

const image = (sourceUrl: string) => ({
  base64: 'aWNvbg==',
  contentHash: 'hash',
  mimeType: 'image/png',
  sourceUrl
})

describe('Chainlist icon lookup', () => {
  it('embeds the Chainlist slug icon and caches the catalog', async () => {
    const fetchCatalog = mock(async (_url: string, _init: RequestInit) => ({
      ok: true,
      json: async () => [
        { chainId: 1, chainSlug: 'ethereum' },
        { chainId: 4663, chainSlug: 'robinhood', icon: 'https://cdn.robinhood.com/chain.png' }
      ]
    }))
    const loadImage = mock(async (sourceUrl: string) => image(sourceUrl))
    const lookup = createChainlistIconLookup(fetchCatalog, loadImage)

    expect(await lookup(4663)).toBe('data:image/png;base64,aWNvbg==')
    expect(await lookup(1)).toBe('data:image/png;base64,aWNvbg==')
    expect(fetchCatalog).toHaveBeenCalledTimes(1)
    expect(fetchCatalog.mock.calls[0][0]).toBe('https://chainlist.org/rpcs.json')
    expect(loadImage.mock.calls.map(([sourceUrl]) => sourceUrl)).toEqual([
      'https://icons.llamao.fi/icons/chains/rsz_robinhood.jpg',
      'https://icons.llamao.fi/icons/chains/rsz_ethereum.jpg'
    ])
  })

  it('uses the catalog icon name when no chain slug exists', async () => {
    const fetchCatalog = mock(async (_url: string, _init: RequestInit) => ({
      ok: true,
      json: async () => [{ chainId: 10, icon: 'optimism' }]
    }))
    const loadImage = mock(async (sourceUrl: string) => image(sourceUrl))
    const lookup = createChainlistIconLookup(fetchCatalog, loadImage)

    expect(await lookup(10)).toBe('data:image/png;base64,aWNvbg==')
    expect(await lookup(999_999)).toBe('')
    expect(loadImage).toHaveBeenCalledTimes(1)
    expect(loadImage).toHaveBeenCalledWith('https://icons.llamao.fi/icons/chains/rsz_optimism.jpg')
  })

  it('keeps a failed image download from blocking the add-chain request', async () => {
    const lookup = createChainlistIconLookup(
      async () => ({ ok: true, json: async () => [{ chainId: 4663, chainSlug: 'robinhood' }] }),
      async () => {
        throw new Error('Image unavailable')
      }
    )

    expect(await lookup(4663)).toBe('')
  })
})
