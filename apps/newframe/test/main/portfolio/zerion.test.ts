import ZerionPortfolioProvider, {
  supportsPortfolioChain,
  toZerionChainIds
} from '../../../main/portfolio/providers/zerion'
import { NATIVE_CURRENCY } from '../../../resources/constants'

function createResponse(body: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as Response
}

describe('ZerionPortfolioProvider', () => {
  it('maps supported Frame chains to Zerion chain ids', () => {
    expect(supportsPortfolioChain(1)).toBe(true)
    expect(supportsPortfolioChain(8453)).toBe(true)
    expect(supportsPortfolioChain(56)).toBe(true)
    expect(supportsPortfolioChain(59144)).toBe(true)
    expect(supportsPortfolioChain(11155111)).toBe(false)
    expect(toZerionChainIds([1, 8453, 11155111, 1])).toEqual(['ethereum', 'base'])
    expect(toZerionChainIds([1, 56, 56, 59144])).toEqual(['ethereum', 'binance-smart-chain', 'linea'])
  })

  it('normalizes portfolio positions with a statically supported chain', async () => {
    const fetchMock = jest.fn((url: string) => {
      if (url.includes('/portfolio')) {
        return Promise.resolve(
          createResponse({
            data: {
              attributes: {
                positions_distribution_by_chain: {
                  'binance-smart-chain': 12
                },
                total: {
                  positions: 12
                }
              }
            }
          })
        )
      }

      return Promise.resolve(
        createResponse({
          data: [
            {
              attributes: {
                quantity: {
                  int: '1000000000000000000',
                  decimals: 18,
                  numeric: '1'
                },
                price: 12,
                fungible_info: {
                  name: 'Dynamic Token',
                  symbol: 'DYN',
                  implementations: [
                    {
                      chain_id: 'binance-smart-chain',
                      address: '0x0000000000000000000000000000000000000056',
                      decimals: 18
                    }
                  ]
                }
              },
              relationships: {
                chain: {
                  data: {
                    id: 'binance-smart-chain'
                  }
                }
              }
            }
          ]
        })
      )
    })

    const provider = new ZerionPortfolioProvider({
      apiKey: 'test-key',
      fetch: fetchMock as unknown as typeof fetch,
      requestPolicyOptions: {
        minIntervalMs: 0,
        maxRetries: 0
      }
    })

    const portfolio = await provider.getWalletPortfolio('0xabc' as Address, [56], { sync: true })

    expect(portfolio.chainValues).toEqual({ 56: 12 })
    expect(portfolio.balances).toEqual([
      {
        address: '0x0000000000000000000000000000000000000056',
        chainId: 56,
        name: 'Dynamic Token',
        symbol: 'DYN',
        decimals: 18,
        logoURI: '',
        balance: '0xde0b6b3a7640000',
        displayBalance: '1'
      }
    ])
    expect(fetchMock.mock.calls[1][0]).toContain('filter%5Bchain_ids%5D=binance-smart-chain')
  })

  it('returns an empty snapshot when no requested chain is supported', async () => {
    const fetchMock = jest.fn()
    const provider = new ZerionPortfolioProvider({
      apiKey: 'test-key',
      fetch: fetchMock as unknown as typeof fetch,
      requestPolicyOptions: {
        minIntervalMs: 0,
        maxRetries: 0
      }
    })

    await expect(
      provider.getWalletPortfolio('0xabc' as Address, [11155111], { sync: true })
    ).resolves.toEqual({
      totalValue: 0,
      absoluteChange1d: 0,
      percentChange1d: 0,
      chainValues: {},
      tokens: [],
      balances: [],
      rates: {},
      nativeRates: {}
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fetches the provider chain image for statically supported chains', async () => {
    const fetchMock = jest.fn((url: string, init?: RequestInit) => {
      expect(url).toBe('https://api.zerion.io/v1/chains/binance-smart-chain')
      expect(init?.headers).toEqual({
        Authorization: `Basic ${Buffer.from('test-key:').toString('base64')}`
      })

      return Promise.resolve(
        createResponse({
          data: {
            attributes: {
              icon: {
                url: 'https://cdn.example/bsc.png'
              }
            }
          }
        })
      )
    })

    const provider = new ZerionPortfolioProvider({
      apiKey: 'test-key',
      fetch: fetchMock as unknown as typeof fetch,
      requestPolicyOptions: {
        minIntervalMs: 0,
        maxRetries: 0
      }
    })

    await expect(provider.getChainImage(56)).resolves.toEqual({ url: 'https://cdn.example/bsc.png' })
  })

  it('does not fetch provider chain images for unsupported chains', async () => {
    const fetchMock = jest.fn()
    const provider = new ZerionPortfolioProvider({
      apiKey: 'test-key',
      fetch: fetchMock as unknown as typeof fetch,
      requestPolicyOptions: {
        minIntervalMs: 0,
        maxRetries: 0
      }
    })

    await expect(provider.getChainImage(11155111)).resolves.toBeUndefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('normalizes portfolio positions into Frame tokens for the held chain only', async () => {
    const fetchMock = jest.fn((url: string, init?: RequestInit) => {
      expect(init?.headers).toEqual({
        Authorization: `Basic ${Buffer.from('test-key:').toString('base64')}`
      })

      if (url.includes('/portfolio')) {
        return Promise.resolve(
          createResponse({
            data: {
              attributes: {
                positions_distribution_by_chain: {
                  ethereum: 12,
                  base: 34,
                  zora: 56
                },
                total: {
                  positions: 46
                },
                changes: {
                  absolute_1d: 1.2,
                  percent_1d: 2.3
                }
              }
            }
          })
        )
      }

      return Promise.resolve(
        createResponse({
          data: [
            {
              attributes: {
                quantity: {
                  int: '1000000',
                  decimals: 6,
                  numeric: '1'
                },
                value: 1.01,
                price: 1.01,
                changes: {
                  percent_1d: 0.25
                },
                fungible_info: {
                  name: 'USD Coin',
                  symbol: 'USDC',
                  icon: {
                    url: 'https://cdn.example/usdc.png'
                  },
                  implementations: [
                    {
                      chain_id: 'ethereum',
                      address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
                      decimals: 6
                    },
                    {
                      chain_id: 'base',
                      address: '0x833589fcd6edb6e08f4c7c32d4f71b54bdA02913',
                      decimals: 6
                    }
                  ]
                }
              },
              relationships: {
                chain: {
                  data: {
                    id: 'base'
                  }
                }
              }
            },
            {
              attributes: {
                name: 'Ethereum',
                quantity: {
                  int: '1000000000000000000',
                  decimals: 18,
                  numeric: '1'
                },
                value: 2000,
                price: 2000,
                changes: {
                  percent_1d: 1.5
                },
                fungible_info: {
                  name: 'Ethereum',
                  symbol: 'ETH',
                  icon: {
                    url: 'https://cdn.example/eth.png'
                  },
                  implementations: []
                }
              },
              relationships: {
                chain: {
                  data: {
                    id: 'ethereum'
                  }
                }
              }
            },
            {
              attributes: {
                name: 'Wrong Chain',
                quantity: {
                  int: '2000000',
                  decimals: 6,
                  numeric: '2'
                },
                price: 1,
                fungible_info: {
                  name: 'Wrong Chain',
                  symbol: 'WRONG',
                  implementations: [
                    {
                      chain_id: 'ethereum',
                      address: '0x0000000000000000000000000000000000000002',
                      decimals: 6
                    }
                  ]
                }
              },
              relationships: {
                chain: {
                  data: {
                    id: 'base'
                  }
                }
              }
            },
            {
              attributes: {
                quantity: {
                  int: '0'
                },
                fungible_info: {
                  name: 'Zero Token',
                  symbol: 'ZERO',
                  implementations: [
                    {
                      chain_id: 'ethereum',
                      address: '0x0000000000000000000000000000000000000001',
                      decimals: 18
                    }
                  ]
                }
              },
              relationships: {
                chain: {
                  data: {
                    id: 'ethereum'
                  }
                }
              }
            }
          ]
        })
      )
    })

    const provider = new ZerionPortfolioProvider({
      apiKey: 'test-key',
      fetch: fetchMock as unknown as typeof fetch,
      requestPolicyOptions: {
        minIntervalMs: 0,
        maxRetries: 0
      }
    })
    const portfolio = await provider.getWalletPortfolio('0xabc' as Address, [1, 8453], { sync: true })

    expect(portfolio.totalValue).toBe(46)
    expect(portfolio.absoluteChange1d).toBe(1.2)
    expect(portfolio.percentChange1d).toBe(2.3)
    expect(portfolio.chainValues).toEqual({
      1: 12,
      8453: 34
    })
    expect(portfolio.tokens).toEqual([
      {
        address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
        chainId: 8453,
        name: 'USD Coin',
        symbol: 'USDC',
        decimals: 6,
        logoURI: 'https://cdn.example/usdc.png'
      }
    ])
    expect(portfolio.balances).toEqual([
      {
        address: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
        chainId: 8453,
        name: 'USD Coin',
        symbol: 'USDC',
        decimals: 6,
        logoURI: 'https://cdn.example/usdc.png',
        balance: '0xf4240',
        displayBalance: '1'
      },
      {
        address: NATIVE_CURRENCY,
        chainId: 1,
        name: 'Ethereum',
        symbol: 'ETH',
        decimals: 18,
        balance: '0xde0b6b3a7640000',
        displayBalance: '1'
      }
    ])
    expect(portfolio.rates).toEqual({
      '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913': {
        usd: {
          price: 1.01,
          change24hr: 0.25
        }
      }
    })
    expect(portfolio.nativeRates).toEqual({
      1: {
        price: 2000,
        change24hr: 1.5
      }
    })

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[1][0]).toContain('filter%5Bchain_ids%5D=ethereum%2Cbase')
    expect(fetchMock.mock.calls[1][0]).toContain('sync=true')
  })
})
