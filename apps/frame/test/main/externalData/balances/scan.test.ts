import balanceLoader from '../../../../main/externalData/balances/scan'
import multicall, { supportsChain } from '../../../../main/multicall'

import log from 'electron-log'
import { addHexPrefix, padToEven } from '@ethereumjs/util'
import ethProvider from 'eth-provider'

jest.mock('../../../../main/multicall')
jest.mock('eth-provider', () =>
  jest.fn(() => ({
    request: jest.fn(),
    setChain: jest.fn()
  }))
)

const callResponse = '0x0000000000000000000000000000000000000000000000000000000000000000'
const ownerAddress = '0xbfa641051ba0a0ad1b0acf549a89536a0d76472e'

const aaveUsdcToken = {
  chainId: 1,
  address: '0xbcca60bb61934080951369a648fb03df4f96263c',
  symbol: 'aUSDC',
  decimals: 6
}

const zrxToken = {
  chainId: 1,
  address: '0xe41d2489571d322189246dafa5ebde1f4699f498',
  symbol: 'ZRX',
  decimals: 18
}

const olympusDaoToken = {
  chainId: 1,
  address: '0x383518188c0c6d7730d91b2c03a03c837814a899',
  symbol: 'OHM',
  decimals: 9
}

const badgerDaoToken = {
  chainId: 42161,
  address: '0xbfa641051ba0a0ad1b0acf549a89536a0d76472e',
  symbol: 'BADGER',
  decimals: 18
}

let eth: any, balancesLoader: any, onChainBalances: any
const knownTokens = [aaveUsdcToken, zrxToken, badgerDaoToken]

beforeAll(() => {
  log.transports.console.level = false
})

afterAll(() => {
  log.transports.console.level = 'debug'
})

describe('#getTokenBalances', () => {
  beforeEach(() => {
    eth = ethProvider()
    balancesLoader = balanceLoader(eth)

    onChainBalances = {
      [aaveUsdcToken.address]: BigInt('6245100000'),
      [zrxToken.address]: BigInt('756578458984500000000'),
      [olympusDaoToken.address]: BigInt('557830302000'),
      [badgerDaoToken.address]: BigInt('17893000000000000000')
    }
  })

  describe('using multicall', () => {
    beforeEach(() => {
      ;(supportsChain as any).mockReturnValue(true)
      ;(multicall as any).mockImplementation((chainId: any) => {
        return {
          batchCall: async function (tokenCalls: any) {
            return tokenCalls.map((tc: any) => {
              expect(tc.call[0]).toBe('function balanceOf(address owner) returns (uint256 value)')
              expect(tc.call[1]).toBe(ownerAddress)

              const token: any = knownTokens.find(
                (token) => token.address === tc.target && token.chainId === parseInt(chainId)
              )

              if (token) {
                return {
                  success: true,
                  returnValues: [tc.returns[0](onChainBalances[token.address])]
                }
              }

              return '0x0'
            })
          }
        }
      })
    })

    afterEach(() => {
      ;(multicall as any).mockReset()
    })

    it('loads token balances for multiple chains', async () => {
      const tokenBalances = await balancesLoader.getTokenBalances(ownerAddress, knownTokens)

      expect(tokenBalances).toEqual([
        {
          ...aaveUsdcToken,
          balance: addHexPrefix(padToEven(BigInt('6245100000').toString(16))),
          displayBalance: '6245.1'
        },
        {
          ...zrxToken,
          balance: addHexPrefix(padToEven(BigInt('756578458984500000000').toString(16))),
          displayBalance: '756.5784589845'
        },
        {
          ...badgerDaoToken,
          balance: addHexPrefix(padToEven(BigInt('17893000000000000000').toString(16))),
          displayBalance: '17.893'
        }
      ])
    })
  })

  describe('using direct contract calls', () => {
    const callHandler = jest.fn(respondToTokenCall)

    beforeEach(() => {
      ;(supportsChain as any).mockReturnValue(false)

      eth.request.mockImplementation(async (payload: any) => {
        expect(payload.method).toBe('eth_call')
        return callHandler(payload)
      })
    })

    afterEach(() => {
      expect(multicall).not.toHaveBeenCalled()
    })

    it('loads token balances for multiple chains', async () => {
      const tokenBalances = await balancesLoader.getTokenBalances(ownerAddress, knownTokens)

      expect(tokenBalances).toEqual([
        {
          ...aaveUsdcToken,
          balance: addHexPrefix(padToEven(BigInt('6245100000').toString(16))),
          displayBalance: '6245.1'
        },
        {
          ...zrxToken,
          balance: addHexPrefix(padToEven(BigInt('756578458984500000000').toString(16))),
          displayBalance: '756.5784589845'
        },
        {
          ...badgerDaoToken,
          balance: addHexPrefix(padToEven(BigInt('17893000000000000000').toString(16))),
          displayBalance: '17.893'
        }
      ])
    })

    it('handles an error retrieving one balance', async () => {
      callHandler.mockImplementation((payload) => {
        if (payload.params[0].to === zrxToken.address) {
          throw new Error('invalid token contract!')
        }

        return respondToTokenCall(payload)
      })

      const tokenBalances = await balancesLoader.getTokenBalances(ownerAddress, knownTokens)

      expect(tokenBalances).toEqual([
        {
          ...aaveUsdcToken,
          balance: addHexPrefix(padToEven(BigInt('6245100000').toString(16))),
          displayBalance: '6245.1'
        },
        {
          ...badgerDaoToken,
          balance: addHexPrefix(padToEven(BigInt('17893000000000000000').toString(16))),
          displayBalance: '17.893'
        }
      ])
    })
  })
})

// helper functions //

function respondToTokenCall(payload: any) {
  expect(payload.params[0].value).toBe('0x0')
  expect(payload.params[0].data).toBe(
    '0x70a08231000000000000000000000000bfa641051ba0a0ad1b0acf549a89536a0d76472e'
  )
  expect(payload.params[1]).toBe('latest')

  const token: any = knownTokens.find(
    (token) => token.address === payload.params[0].to && token.chainId === parseInt(payload.chainId)
  )

  const balance = onChainBalances[token.address]

  if (balance) {
    const hexBalance = balance.toString(16)

    return callResponse.slice(0, callResponse.length - hexBalance.length) + hexBalance
  }

  return callResponse
}
