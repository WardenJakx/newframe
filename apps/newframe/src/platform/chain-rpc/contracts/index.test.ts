import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  jest as timers,
  mock,
  spyOn,
  type Mock
} from 'bun:test'

import log from 'electron-log'

import { internet } from '../../internet/index.ts'

await mock.module('./sources/sourcify.ts', () => ({ fetchSourcifyContract: mock() }))
await mock.module('./sources/etherscan.ts', () => ({ fetchEtherscanContract: mock() }))

let fetchContract: typeof import('./index.ts').fetchContract
let decodeCallData: typeof import('./index.ts').decodeCallData
let decodeCallDataWithSelectorRegistry: typeof import('./index.ts').decodeCallDataWithSelectorRegistry
let clearFunctionSelectorCache: typeof import('./selectors.ts').clearFunctionSelectorCache
let fetchSourcifyContract: typeof import('./sources/sourcify.ts').fetchSourcifyContract
let fetchEtherscanContract: typeof import('./sources/etherscan.ts').fetchEtherscanContract

const originalFetch = globalThis.fetch

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

beforeAll(async () => {
  log.transports.console.level = false
  spyOn(internet, 'request').mockImplementation((input, init) => globalThis.fetch(input, init))
  ;({ decodeCallData, decodeCallDataWithSelectorRegistry, fetchContract } = await import('./index.ts'))
  ;({ clearFunctionSelectorCache } = await import('./selectors.ts'))
  ;({ fetchSourcifyContract } = await import('./sources/sourcify.ts'))
  ;({ fetchEtherscanContract } = await import('./sources/etherscan.ts'))
})

afterEach(() => {
  timers.useRealTimers()
  clearFunctionSelectorCache()
  globalThis.fetch = originalFetch
})

afterAll(() => {
  log.transports.console.level = 'debug'
})

describe('#fetchContract', () => {
  it('retrieves a contract from sourcify', async () => {
    ;(fetchSourcifyContract as Mock<typeof fetchSourcifyContract>).mockResolvedValue(
      mockContractSource('sourcify')
    )

    return expect(fetchContract('0x3432b6a60d23ca0dfca7761b7ab56459d9c964d0', 1)).resolves.toStrictEqual({
      abi: JSON.stringify(mockAbi),
      name: 'mock sourcify abi',
      source: 'sourcify'
    })
  })

  it(`retrieves a contract from etherscan when sourcify returns no contract`, async () => {
    ;(fetchSourcifyContract as Mock<typeof fetchSourcifyContract>).mockResolvedValue(undefined)
    ;(fetchEtherscanContract as Mock<typeof fetchEtherscanContract>).mockResolvedValue(
      mockContractSource('etherscan')
    )

    return expect(fetchContract('0x3432b6a60d23ca0dfca7761b7ab56459d9c964d0', 1)).resolves.toStrictEqual({
      abi: JSON.stringify(mockAbi),
      name: 'mock etherscan abi',
      source: 'etherscan'
    })
  })

  it('prioritizes a contract from sourcify when both sources return contracts', async () => {
    ;(fetchSourcifyContract as Mock<typeof fetchSourcifyContract>).mockResolvedValue(
      mockContractSource('sourcify')
    )
    ;(fetchEtherscanContract as Mock<typeof fetchEtherscanContract>).mockResolvedValue(
      mockContractSource('etherscan')
    )

    return expect(fetchContract('0x3432b6a60d23ca0dfca7761b7ab56459d9c964d0', 1)).resolves.toStrictEqual({
      abi: JSON.stringify(mockAbi),
      name: 'mock sourcify abi',
      source: 'sourcify'
    })
  })

  it('waits for a contract from sourcify even if etherscan returns first', async () => {
    timers.useFakeTimers()
    const sourcifyResponse = new Promise<Awaited<ReturnType<typeof fetchSourcifyContract>>>((resolve) =>
      setTimeout(() => resolve(mockContractSource('sourcify')), 40)
    )
    const etherscanResponse = new Promise<Awaited<ReturnType<typeof fetchEtherscanContract>>>((resolve) =>
      setTimeout(() => resolve(mockContractSource('etherscan')), 20)
    )

    ;(fetchSourcifyContract as Mock<typeof fetchSourcifyContract>).mockReturnValue(sourcifyResponse)
    ;(fetchEtherscanContract as Mock<typeof fetchEtherscanContract>).mockReturnValue(etherscanResponse)

    const contract = fetchContract('0x3432b6a60d23ca0dfca7761b7ab56459d9c964d0', 1)
    timers.advanceTimersByTime(40)

    return expect(contract).resolves.toStrictEqual({
      abi: JSON.stringify(mockAbi),
      name: 'mock sourcify abi',
      source: 'sourcify'
    })
  })

  it(`does not retrieve a contract when no contracts are available from any sources`, async () => {
    ;(fetchSourcifyContract as Mock<typeof fetchSourcifyContract>).mockResolvedValue(undefined)
    ;(fetchEtherscanContract as Mock<typeof fetchEtherscanContract>).mockResolvedValue(undefined)

    return expect(fetchContract('0x3432b6a60d23ca0dfca7761b7ab56459d9c964d0', 1)).resolves.toBeUndefined()
  })
})

describe('#decodeCallData', () => {
  it('decodes a matching ABI method and records the selector/signature', () => {
    const calldata = '0x6057361d000000000000000000000000000000000000000000000000000000000000007b'

    expect(decodeCallData(calldata, JSON.stringify(mockAbi))).toStrictEqual({
      selector: '0x6057361d',
      signature: 'store(uint256)',
      method: 'store',
      args: [{ name: 'num', type: 'uint256', value: '123' }]
    })
  })

  it('rejects a decoded method when re-encoding does not match the original calldata', () => {
    const calldata = '0x6057361d000000000000000000000000000000000000000000000000000000000000007b00'

    expect(decodeCallData(calldata, JSON.stringify(mockAbi))).toBeUndefined()
  })
})

describe('#decodeCallDataWithSelectorRegistry', () => {
  it('decodes local selector signatures without an internet request', async () => {
    globalThis.fetch = mock(async () => ({
      ok: true,
      json: async () => ({ result: { function: {} } })
    })) as unknown as typeof fetch

    const calldata =
      '0xa22cb4650000000000000000000000009bc5baf874d2da8d216ae9f137804184ee5afef40000000000000000000000000000000000000000000000000000000000000001'

    expect(decodeCallDataWithSelectorRegistry(calldata)).resolves.toStrictEqual({
      selector: '0xa22cb465',
      signature: 'setApprovalForAll(address,bool)',
      method: 'setApprovalForAll',
      args: [
        {
          name: 'operator',
          type: 'address',
          value: '0x9bc5baF874d2DA8D216aE9f137804184EE5AfEF4'
        },
        { name: 'approved', type: 'bool', value: 'true' }
      ]
    })
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('decodes fetched selector signatures when the ABI round trip is exact', async () => {
    const calldata =
      '0x7602886d000000000000000000000000000000000000000000000000000000000000007b0000000000000000000000009bc5baf874d2da8d216ae9f137804184ee5afef4'

    globalThis.fetch = mock(async () => ({
      ok: true,
      json: async () => ({
        result: {
          function: {
            '0x7602886d': [{ name: 'mockCall(uint256,address)', filtered: false }]
          }
        }
      })
    })) as unknown as typeof fetch

    expect(decodeCallDataWithSelectorRegistry(calldata)).resolves.toStrictEqual({
      selector: '0x7602886d',
      signature: 'mockCall(uint256,address)',
      method: 'mockCall',
      args: [
        { name: 'arg0', type: 'uint256', value: '123' },
        {
          name: 'arg1',
          type: 'address',
          value: '0x9bc5baF874d2DA8D216aE9f137804184EE5AfEF4'
        }
      ]
    })
  })

  it('does not accept selector signatures when re-encoding leaves trailing bytes', async () => {
    const calldata =
      '0x7602886d000000000000000000000000000000000000000000000000000000000000007b0000000000000000000000009bc5baf874d2da8d216ae9f137804184ee5afef400'

    globalThis.fetch = mock(async () => ({
      ok: true,
      json: async () => ({
        result: {
          function: {
            '0x7602886d': [{ name: 'mockCall(uint256,address)', filtered: false }]
          }
        }
      })
    })) as unknown as typeof fetch

    expect(decodeCallDataWithSelectorRegistry(calldata)).resolves.toBeUndefined()
  })
})

function mockContractSource(source: string) {
  return {
    abi: JSON.stringify(mockAbi),
    name: `mock ${source} abi`,
    source
  }
}
