import { describe, expect, it } from 'bun:test'

import { getFlashAssetsForChain } from '../domain/flash/assets'
import { createTestStore } from '../test/support/createTestStore'
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

function expectedTokens(chainId: number) {
  return getFlashAssetsForChain(chainId)
    .filter((asset) => !asset.isNative)
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
  it('hydrates only the networks owned by each injected canonical store', () => {
    const ethereum = createTestStore({
      main: { networks: { ethereum: { 1: { id: 1 } } } }
    })
    const base = createTestStore({
      main: { networks: { ethereum: { 8453: { id: 8453 } } } }
    })
    const ethereumTokens = createBundledTokenService(ethereum.store)
    const baseTokens = createBundledTokenService(base.store)

    ethereumTokens.start()

    expect({
      ethereum: tokenProjection(ethereum),
      untouchedBase: tokenProjection(base)
    }).toStrictEqual({
      ethereum: expectedTokens(1),
      untouchedBase: []
    })

    baseTokens.start()

    expect({
      base: tokenProjection(base),
      unchangedEthereum: tokenProjection(ethereum)
    }).toStrictEqual({
      base: expectedTokens(8453),
      unchangedEthereum: expectedTokens(1)
    })
  })
})
