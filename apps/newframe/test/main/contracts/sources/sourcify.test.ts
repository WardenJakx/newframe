import log from 'electron-log'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock, spyOn } from 'bun:test'

import { fetchSourcifyContract } from '../../../../main/contracts/sources/sourcify'

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

const sourcifyResponse = {
  status: 'partial',
  files: [
    {
      name: 'metadata.json',
      path: '',
      content: JSON.stringify({
        output: {
          abi: mockAbi,
          devdoc: { title: 'mock sourcify abi' }
        }
      })
    }
  ]
}

const sourcifyNotFoundResponse = {
  error: 'Files have not been found!'
}

beforeAll(() => {
  log.transports.console.level = false
  log.transports.file.level = false
})

afterAll(() => {
  log.transports.console.level = 'debug'
  log.transports.file.level = 'info'
})

beforeEach(() => {
  spyOn(globalThis, 'fetch').mockImplementation((() =>
    Promise.reject(new Error('Unexpected fetch'))) as unknown as typeof fetch)
})

afterEach(() => {
  mock.restore()
})

describe('#fetchSourcifyContract', () => {
  const contractAddress = '0x3432b6a60d23ca0dfca7761b7ab56459d9c964d0'
  const domain = 'sourcify.dev'
  const endpoint = `/server/files/any/137/${contractAddress}`

  const mockSourcifyApi = (status: number, response?: unknown, delay?: number) => {
    mockApiResponse(domain, endpoint, status, response, delay)
  }

  it('retrieves a contract from sourcify', async () => {
    mockSourcifyApi(200, sourcifyResponse)

    return expect(fetchSourcifyContract(contractAddress, 137)).resolves.toStrictEqual({
      abi: JSON.stringify(mockAbi),
      name: 'mock sourcify abi',
      source: 'sourcify'
    })
  })

  it('does not retrieve a contract when the request fails', async () => {
    mockSourcifyApi(400)

    return expect(fetchSourcifyContract(contractAddress, 137)).resolves.toBeUndefined()
  })

  it('does not retrieve a contract when the contract is not found', async () => {
    mockSourcifyApi(200, sourcifyNotFoundResponse)

    return expect(fetchSourcifyContract(contractAddress, 137)).resolves.toBeUndefined()
  })

  it('does not retrieve a contract when the request times out', async () => {
    mockSourcifyApi(200, sourcifyResponse, 10000)

    return expect(fetchSourcifyContract(contractAddress, 137)).resolves.toBeUndefined()
  })
})
