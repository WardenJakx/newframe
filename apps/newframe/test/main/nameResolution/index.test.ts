import { beforeAll, beforeEach, describe, expect, it, mock } from 'bun:test'

import { GNS_CONTRACT, gnsAbi } from '@donnoh/gns-utils'
import { Interface, ZeroAddress, getAddress } from 'ethers'

const providerMock = {
  setChain: mock(),
  on: mock(),
  off: mock(),
  once: mock(),
  request: mock()
}

mock.module('../../../main/provider/proxy', () => ({ default: {} }))
mock.module('../../../main/provider/connection', () => ({
  createProxyProvider: mock(() => providerMock)
}))

const UNIVERSAL_RESOLVER_ADDRESS = '0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe'
const gnsInterface = new Interface(gnsAbi)
const resolverInterface = new Interface(['function addr(bytes32 node) view returns (address)'])
const universalResolverInterface = new Interface([
  'function resolveWithGateways(bytes name, bytes data, string[] gateways) view returns (bytes result, address resolver)',
  'function reverseWithGateways(bytes lookupAddress, uint256 coinType, string[] gateways) view returns (string primary, address resolver, address reverseResolver)'
])

const gnsAddress = '0x1111111111111111111111111111111111111111'
const ensAddress = '0x2222222222222222222222222222222222222222'

let nameResolution: any

function callsTo(address: string) {
  return providerMock.request.mock.calls.filter(([payload]: any[]) => payload.params[0].to === address)
}

function mockNameRequests({
  gnsRecords = {},
  gnsReverseRecords = {},
  ensForwardAddress = ensAddress,
  ensReverseName = 'alice.eth'
}: {
  gnsRecords?: Record<string, string>
  gnsReverseRecords?: Record<string, string>
  ensForwardAddress?: string
  ensReverseName?: string
} = {}) {
  const tokenNames = new Map<bigint, string>()
  const tokenIds = new Map<string, bigint>()

  providerMock.request.mockImplementation(async ({ params }: any) => {
    const [{ to, data }] = params

    if (to === GNS_CONTRACT) {
      const parsed = gnsInterface.parseTransaction({ data })
      if (!parsed) throw new Error('Unknown GNS calldata')

      if (parsed.name === 'computeId') {
        const name = parsed.args[0] as string
        const tokenId = tokenIds.get(name) || BigInt(tokenIds.size + 1)

        tokenIds.set(name, tokenId)
        tokenNames.set(tokenId, name)

        return gnsInterface.encodeFunctionResult('computeId', [tokenId])
      }

      if (parsed.name === 'resolve') {
        const name = tokenNames.get(parsed.args[0] as bigint)
        const address = (name && gnsRecords[name]) || ZeroAddress

        return gnsInterface.encodeFunctionResult('resolve', [address])
      }

      if (parsed.name === 'reverseResolve') {
        const address = getAddress(parsed.args[0] as string).toLowerCase()

        return gnsInterface.encodeFunctionResult('reverseResolve', [gnsReverseRecords[address] || ''])
      }
    }

    if (to === UNIVERSAL_RESOLVER_ADDRESS) {
      const parsed = universalResolverInterface.parseTransaction({ data })
      if (!parsed) throw new Error('Unknown ENS calldata')

      if (parsed.name === 'resolveWithGateways') {
        const result = resolverInterface.encodeFunctionResult('addr', [ensForwardAddress])

        return universalResolverInterface.encodeFunctionResult('resolveWithGateways', [result, ZeroAddress])
      }

      if (parsed.name === 'reverseWithGateways') {
        return universalResolverInterface.encodeFunctionResult('reverseWithGateways', [
          ensReverseName,
          ZeroAddress,
          ZeroAddress
        ])
      }
    }

    throw new Error(`Unexpected call to ${to}`)
  })
}

beforeAll(async () => {
  nameResolution = (await import('../../../main/nameResolution')).default
})

beforeEach(() => {
  providerMock.request.mockReset()
})

describe('name resolution', () => {
  it('resolves .gwei names through GNS without querying ENS', async () => {
    mockNameRequests({ gnsRecords: { 'alice.gwei': gnsAddress } })

    await expect(nameResolution.resolveAddress('alice.gwei')).resolves.toBe(getAddress(gnsAddress))
    expect(callsTo(GNS_CONTRACT)).toHaveLength(2)
    expect(callsTo(UNIVERSAL_RESOLVER_ADDRESS)).toHaveLength(0)
  })

  it('resolves bare labels through GNS', async () => {
    mockNameRequests({ gnsRecords: { 'alice.gwei': gnsAddress } })

    await expect(nameResolution.resolveAddress('Alice')).resolves.toBe(getAddress(gnsAddress))
    expect(callsTo(GNS_CONTRACT)).toHaveLength(2)
    expect(callsTo(UNIVERSAL_RESOLVER_ADDRESS)).toHaveLength(0)
  })

  it('uses ENS for dotted non-GNS names', async () => {
    mockNameRequests()

    await expect(nameResolution.resolveAddress('alice.eth')).resolves.toBe(getAddress(ensAddress))
    expect(callsTo(GNS_CONTRACT)).toHaveLength(0)
    expect(callsTo(UNIVERSAL_RESOLVER_ADDRESS)).toHaveLength(1)
  })

  it('prefers GNS reverse names over ENS reverse names', async () => {
    mockNameRequests({
      gnsReverseRecords: {
        [gnsAddress.toLowerCase()]: 'alice.gwei'
      },
      ensReverseName: 'alice.eth'
    })

    await expect(nameResolution.reverseLookup(gnsAddress)).resolves.toBe('alice.gwei')
    expect(callsTo(GNS_CONTRACT)).toHaveLength(1)
    expect(callsTo(UNIVERSAL_RESOLVER_ADDRESS)).toHaveLength(0)
  })

  it('falls back to ENS reverse lookup when GNS has no primary name', async () => {
    mockNameRequests({ ensReverseName: 'alice.eth' })

    await expect(nameResolution.reverseLookup(gnsAddress)).resolves.toBe('alice.eth')
    expect(callsTo(GNS_CONTRACT)).toHaveLength(1)
    expect(callsTo(UNIVERSAL_RESOLVER_ADDRESS)).toHaveLength(1)
  })
})
