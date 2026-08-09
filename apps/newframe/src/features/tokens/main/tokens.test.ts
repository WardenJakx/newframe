import { describe, expect, it } from 'bun:test'

import { listCuratedTokenAssets } from '../../asset-data/domain/asset'
import { createTestStore } from '../../../../test/support/createTestStore'
import { createBundledTokenService } from './tokens'

function tokenProjection(store: ReturnType<typeof createTestStore>) {
  return Object.values(store.getState().main.tokens.byId)
    .map((token) => ({
      address: token.address,
      chainId: token.chainId,
      curated: token.curated,
      decimals: token.decimals,
      name: token.name,
      sources: token.sources,
      symbol: token.symbol
    }))
    .sort((left, right) => left.address.localeCompare(right.address))
}

function expectedTokens() {
  return listCuratedTokenAssets()
    .map((asset) => ({
      address: asset.address,
      chainId: asset.chainId,
      curated: true,
      decimals: asset.decimals,
      name: asset.name,
      sources: ['bundled' as const],
      symbol: asset.symbol
    }))
    .sort((left, right) => left.address.localeCompare(right.address))
}

describe('bundled token startup', () => {
  it('hydrates every curated ERC-20 into each injected canonical store', () => {
    const first = createTestStore({
      main: { networks: { ethereum: { 1: { id: 1 } } } }
    })
    const second = createTestStore({
      main: { networks: { ethereum: { 8453: { id: 8453 } } } }
    })
    const firstTokens = createBundledTokenService(first.store)
    const secondTokens = createBundledTokenService(second.store)

    firstTokens.start()

    expect({
      first: tokenProjection(first),
      untouchedSecond: tokenProjection(second)
    }).toStrictEqual({
      first: expectedTokens(),
      untouchedSecond: []
    })

    secondTokens.start()

    expect({
      second: tokenProjection(second),
      unchangedFirst: tokenProjection(first)
    }).toStrictEqual({
      second: expectedTokens(),
      unchangedFirst: expectedTokens()
    })
  })
})
