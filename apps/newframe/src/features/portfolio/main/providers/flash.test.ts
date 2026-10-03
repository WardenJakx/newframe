import { describe, expect, it, mock } from 'bun:test'

import type { FlashTokenBalance } from '@newframe/flash/wire'

import { NATIVE_CURRENCY } from '../../../tokens/domain/constants'
import FlashPortfolioProvider from './flash'

const wallet = '0x1111111111111111111111111111111111111111'
const usdc = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'

function row(overrides: Partial<FlashTokenBalance>): FlashTokenBalance {
  return {
    chain: 'ethereum',
    address: usdc,
    symbol: 'USDC',
    tokenDecimals: 6,
    balance: '25.5',
    notional: '25.50',
    priceChange24h: '-0.0342',
    imageUrl: 'https://example.com/usdc.png',
    isNative: false,
    ...overrides
  }
}

describe('FlashPortfolioProvider', () => {
  it('maps Flash balances into tokens, balances and rates for enabled chains', async () => {
    const balances = mock(async (_address: string) => ({
      balances: [
        row({}),
        row({
          address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
          symbol: 'ETH',
          tokenDecimals: 18,
          balance: '1.5',
          notional: '3000',
          priceChange24h: null,
          imageUrl: '',
          isNative: true
        }),
        row({ chain: 'base' }),
        row({ chain: 'solana' }),
        row({ balance: '0' })
      ]
    }))
    const provider = new FlashPortfolioProvider({ api: { balances } })

    const snapshot = await provider.getWalletPortfolio(wallet, [1, 10])

    expect(balances.mock.calls).toEqual([[wallet]])
    expect(snapshot.tokens).toEqual([
      {
        address: usdc.toLowerCase(),
        chainId: 1,
        name: 'USDC',
        symbol: 'USDC',
        decimals: 6,
        logoURI: 'https://example.com/usdc.png'
      }
    ])
    expect(snapshot.balances).toEqual([
      {
        address: usdc.toLowerCase(),
        chainId: 1,
        balance: '0x1851960',
        displayBalance: '25.5'
      },
      {
        address: NATIVE_CURRENCY,
        chainId: 1,
        balance: '0x14d1120d7b160000',
        displayBalance: '1.5'
      }
    ])
    expect(snapshot.assetRates).toEqual([
      {
        chainId: 1,
        address: usdc.toLowerCase(),
        usdRate: 1,
        change24hr: -3.42
      },
      { chainId: 1, address: NATIVE_CURRENCY, usdRate: 2000 }
    ])
  })

  it('skips the request when no enabled chain is supported by Flash', async () => {
    const balances = mock(async (_address: string) => ({ balances: [] }))
    const provider = new FlashPortfolioProvider({ api: { balances } })

    expect(await provider.getWalletPortfolio(wallet, [100])).toEqual({
      tokens: [],
      balances: [],
      assetRates: []
    })
    expect(balances).not.toHaveBeenCalled()
  })
})
