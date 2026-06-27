import log from 'electron-log'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, jest, spyOn } from 'bun:test'

import { fetchEtherscanContract } from '../../../../main/contracts/sources/etherscan'

function mockApiResponse(
  domain: string,
  path: string,
  status: number,
  body: unknown,
  timeout = 0,
  headers: Record<string, string> = { 'content-type': 'application/json' }
) {
  const expectedUrl = `https://${domain}${path}`
  return spyOn(globalThis, 'fetch').mockImplementationOnce(((url, init) => {
    expect(url).toBe(expectedUrl)

    if (timeout > 0) {
      expect(init?.signal).toBeInstanceOf(AbortSignal)

      const error = new Error('The operation was aborted')
      error.name = 'AbortError'
      return Promise.reject(error)
    }

    return Promise.resolve(
      new Response(typeof body === 'undefined' ? '' : JSON.stringify(body), { status, headers })
    )
  }) as typeof fetch)
}

const mockAbi = [
  {
    inputs: [],
    name: 'retrieve',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function'
  },
  {
    inputs: [{ internalType: 'uint256', name: 'num', type: 'uint256' }],
    name: 'store',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function'
  }
]

beforeAll(() => {
  log.transports.console.level = false
  log.transports.file.level = false
})

afterAll(() => {
  log.transports.console.level = 'debug'
  log.transports.file.level = 'info'
})

beforeEach(() => {
  jest.useRealTimers()
  spyOn(globalThis, 'fetch').mockImplementation((() =>
    Promise.reject(new Error('Unexpected fetch'))) as unknown as typeof fetch)
})

afterEach(() => {
  jest.restoreAllMocks()
})

describe('#fetchEtherscanContract', () => {
  const contractAddress = '0x3432b6a60d23ca0dfca7761b7ab56459d9c964d0'
  const getPath = (apiKey: string) =>
    `/api?module=contract&action=getsourcecode&address=${contractAddress}&apikey=${apiKey}`

  const mockEtherscanApi = (status: number, response?: unknown, timeout?: number) => {
    return mockApiResponse(
      'api.etherscan.io',
      getPath('3SYU5MW5QK8RPCJV1XVICHWKT774993S24'),
      status,
      response,
      timeout
    )
  }

  const chains = [
    { chainId: 1, domain: 'api.etherscan.io', apiKey: '3SYU5MW5QK8RPCJV1XVICHWKT774993S24' },
    { chainId: 137, domain: 'api.polygonscan.com', apiKey: '2P3U9T63MT26T1X64AAE368UNTS9RKEEBB' },
    { chainId: 10, domain: 'api-optimistic.etherscan.io', apiKey: '3SYU5MW5QK8RPCJV1XVICHWKT774993S24' },
    { chainId: 42161, domain: 'api.arbiscan.io', apiKey: 'VP126CP67QVH9ZEKAZT1UZ751VZ6ZTIZAD' }
  ]

  chains.forEach((chain) => {
    const name = chain.domain.substring(chain.domain.indexOf('api') + 4)

    it(`retrieves a contract from ${name}`, async () => {
      mockApiResponse(chain.domain, getPath(chain.apiKey), 200, {
        message: 'OK',
        result: [
          {
            ABI: JSON.stringify(mockAbi),
            ContractName: `mock ${name} abi`
          }
        ]
      })

      return expect(fetchEtherscanContract(contractAddress, chain.chainId)).resolves.toStrictEqual({
        abi: JSON.stringify(mockAbi),
        name: `mock ${name} abi`,
        source: name
      })
    })
  })

  it('does not retrieve a contract from etherscan when the request fails', async () => {
    mockEtherscanApi(400)

    return expect(fetchEtherscanContract(contractAddress, 1)).resolves.toBeUndefined()
  }, 200)

  it('does not retrieve a contract from etherscan when the contract is not found', async () => {
    mockEtherscanApi(200, {
      message: 'OK',
      result: undefined
    })

    return expect(fetchEtherscanContract(contractAddress, 1)).resolves.toBeUndefined()
  }, 200)

  it('does not retrieve a contract from etherscan when the ABI is unverified', async () => {
    mockEtherscanApi(200, {
      message: 'OK',
      result: [
        {
          ABI: 'Contract source code not verified',
          ContractName: ''
        }
      ]
    })

    return expect(fetchEtherscanContract(contractAddress, 1)).resolves.toBeUndefined()
  }, 200)

  it('does not retrieve a contract from an unsupported chain', async () => {
    return expect(fetchEtherscanContract(contractAddress, 4)).resolves.toBeUndefined()
  }, 200)

  it('does not retrieve a contract when the request times out', async () => {
    mockEtherscanApi(
      200,
      {
        message: 'OK',
        result: [
          {
            ABI: JSON.stringify(mockAbi),
            ContractName: `mock etherscan abi`
          }
        ]
      },
      10000
    )

    return expect(fetchEtherscanContract(contractAddress, 1)).resolves.toBeUndefined()
  }, 200)
})
