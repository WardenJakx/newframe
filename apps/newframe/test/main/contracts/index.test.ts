import log from 'electron-log'

jest.mock('../../../main/contracts/sources/sourcify', () => ({ fetchSourcifyContract: jest.fn() }))
jest.mock('../../../main/contracts/sources/etherscan', () => ({ fetchEtherscanContract: jest.fn() }))

let fetchContract: typeof import('../../../main/contracts').fetchContract
let decodeCallData: typeof import('../../../main/contracts').decodeCallData
let decodeCallDataWithSelectorRegistry: typeof import('../../../main/contracts').decodeCallDataWithSelectorRegistry
let clearFunctionSelectorCache: typeof import('../../../main/contracts/selectors').clearFunctionSelectorCache
let fetchSourcifyContract: typeof import('../../../main/contracts/sources/sourcify').fetchSourcifyContract
let fetchEtherscanContract: typeof import('../../../main/contracts/sources/etherscan').fetchEtherscanContract

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
  ;({ decodeCallData, decodeCallDataWithSelectorRegistry, fetchContract } = await import('../../../main/contracts'))
  ;({ clearFunctionSelectorCache } = await import('../../../main/contracts/selectors'))
  ;({ fetchSourcifyContract } = await import('../../../main/contracts/sources/sourcify'))
  ;({ fetchEtherscanContract } = await import('../../../main/contracts/sources/etherscan'))
})

afterEach(() => {
  clearFunctionSelectorCache()
  globalThis.fetch = originalFetch
})

afterAll(() => {
  log.transports.console.level = 'debug'
})

describe('#fetchContract', () => {
  it('retrieves a contract from sourcify', async () => {
    ;(fetchSourcifyContract as any).mockResolvedValue(mockContractSource('sourcify'))

    return expect(fetchContract('0x3432b6a60d23ca0dfca7761b7ab56459d9c964d0', 1)).resolves.toStrictEqual({
      abi: JSON.stringify(mockAbi),
      name: 'mock sourcify abi',
      source: 'sourcify'
    })
  })

  it(`retrieves a contract from etherscan when sourcify returns no contract`, async () => {
    ;(fetchSourcifyContract as any).mockResolvedValue(undefined)
    ;(fetchEtherscanContract as any).mockResolvedValue(mockContractSource('etherscan'))

    return expect(fetchContract('0x3432b6a60d23ca0dfca7761b7ab56459d9c964d0', 1)).resolves.toStrictEqual({
      abi: JSON.stringify(mockAbi),
      name: 'mock etherscan abi',
      source: 'etherscan'
    })
  })

  it('prioritizes a contract from sourcify when both sources return contracts', async () => {
    ;(fetchSourcifyContract as any).mockResolvedValue(mockContractSource('sourcify'))
    ;(fetchEtherscanContract as any).mockResolvedValue(mockContractSource('etherscan'))

    return expect(fetchContract('0x3432b6a60d23ca0dfca7761b7ab56459d9c964d0', 1)).resolves.toStrictEqual({
      abi: JSON.stringify(mockAbi),
      name: 'mock sourcify abi',
      source: 'sourcify'
    })
  })

  it('waits for a contract from sourcify even if etherscan returns first', async () => {
    jest.useRealTimers()

    const sourcifyResponse = new Promise((resolve) =>
      setTimeout(() => resolve(mockContractSource('sourcify')), 40)
    )
    const etherscanResponse = new Promise((resolve) =>
      setTimeout(() => resolve(mockContractSource('etherscan')), 20)
    )

    ;(fetchSourcifyContract as any).mockReturnValue(sourcifyResponse)
    ;(fetchEtherscanContract as any).mockReturnValue(etherscanResponse)

    return expect(fetchContract('0x3432b6a60d23ca0dfca7761b7ab56459d9c964d0', 1)).resolves.toStrictEqual({
      abi: JSON.stringify(mockAbi),
      name: 'mock sourcify abi',
      source: 'sourcify'
    })
  })

  it(`does not retrieve a contract when no contracts are available from any sources`, async () => {
    ;(fetchSourcifyContract as any).mockResolvedValue(undefined)
    ;(fetchEtherscanContract as any).mockResolvedValue(undefined)

    return expect(fetchContract('0x3432b6a60d23ca0dfca7761b7ab56459d9c964d0', 1)).resolves.toBeUndefined()
  })
})

describe('#decodeCallData', () => {
  it('decodes a matching ABI method and records the selector/signature', () => {
    const calldata =
      '0x6057361d000000000000000000000000000000000000000000000000000000000000007b'

    expect(decodeCallData(calldata, JSON.stringify(mockAbi))).toStrictEqual({
      selector: '0x6057361d',
      signature: 'store(uint256)',
      method: 'store',
      args: [{ name: 'num', type: 'uint256', value: '123' }]
    })
  })

  it('rejects a decoded method when re-encoding does not match the original calldata', () => {
    const calldata =
      '0x6057361d000000000000000000000000000000000000000000000000000000000000007b00'

    expect(decodeCallData(calldata, JSON.stringify(mockAbi))).toBeUndefined()
  })
})

describe('#decodeCallDataWithSelectorRegistry', () => {
  it('decodes local selector signatures without a network result', async () => {
    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({ result: { function: {} } })
    })) as unknown as typeof fetch

    const calldata =
      '0xa22cb4650000000000000000000000009bc5baf874d2da8d216ae9f137804184ee5afef40000000000000000000000000000000000000000000000000000000000000001'

    await expect(decodeCallDataWithSelectorRegistry(calldata)).resolves.toStrictEqual({
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

    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        result: {
          function: {
            '0x7602886d': [{ name: 'mockCall(uint256,address)', filtered: false }]
          }
        }
      })
    })) as unknown as typeof fetch

    await expect(decodeCallDataWithSelectorRegistry(calldata)).resolves.toStrictEqual({
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

    globalThis.fetch = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        result: {
          function: {
            '0x7602886d': [{ name: 'mockCall(uint256,address)', filtered: false }]
          }
        }
      })
    })) as unknown as typeof fetch

    await expect(decodeCallDataWithSelectorRegistry(calldata)).resolves.toBeUndefined()
  })
})

function mockContractSource(source: any) {
  return {
    abi: JSON.stringify(mockAbi),
    name: `mock ${source} abi`,
    source
  }
}
