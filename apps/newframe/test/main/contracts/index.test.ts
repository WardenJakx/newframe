import log from 'electron-log'

jest.mock('../../../main/contracts/sources/sourcify', () => ({ fetchSourcifyContract: jest.fn() }))
jest.mock('../../../main/contracts/sources/etherscan', () => ({ fetchEtherscanContract: jest.fn() }))

let fetchContract: typeof import('../../../main/contracts').fetchContract
let fetchSourcifyContract: typeof import('../../../main/contracts/sources/sourcify').fetchSourcifyContract
let fetchEtherscanContract: typeof import('../../../main/contracts/sources/etherscan').fetchEtherscanContract

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
  ;({ fetchContract } = await import('../../../main/contracts'))
  ;({ fetchSourcifyContract } = await import('../../../main/contracts/sources/sourcify'))
  ;({ fetchEtherscanContract } = await import('../../../main/contracts/sources/etherscan'))
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

function mockContractSource(source: any) {
  return {
    abi: JSON.stringify(mockAbi),
    name: `mock ${source} abi`,
    source
  }
}
