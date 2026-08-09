import { beforeEach, describe, expect, it } from 'bun:test'

import { EventEmitter } from 'events'
import { GNS_CONTRACT, gnsAbi } from '@donnoh/gns-utils'
import { Interface, ZeroAddress, getAddress } from 'ethers'
import {
  createNameResolutionService,
  createProductionNameResolutionService,
  type NameResolutionProviderPort
} from './nameResolution'
import { createProviderProxyConnection } from '../../connections/main/provider/proxy'

class FakeProvider extends EventEmitter implements NameResolutionProviderPort {
  chainId = ''
  readonly requests: any[] = []
  respond: (payload: any) => Promise<any> = async () => {
    throw new Error('No response configured')
  }

  setChain(chainId: string) {
    this.chainId = chainId
  }

  async request<T>(payload: any) {
    this.requests.push(payload)
    return (await this.respond(payload)) as T
  }
}

const UNIVERSAL_RESOLVER_ADDRESS = '0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe'
const gnsInterface = new Interface(gnsAbi)
const resolverInterface = new Interface(['function addr(bytes32 node) view returns (address)'])
const universalResolverInterface = new Interface([
  'function resolveWithGateways(bytes name, bytes data, string[] gateways) view returns (bytes result, address resolver)',
  'function reverseWithGateways(bytes lookupAddress, uint256 coinType, string[] gateways) view returns (string primary, address resolver, address reverseResolver)'
])

const gnsAddress = '0x1111111111111111111111111111111111111111'
const ensAddress = '0x2222222222222222222222222222222222222222'

let provider: FakeProvider
let nameResolution: ReturnType<typeof createNameResolutionService>

function callsTo(address: string) {
  return provider.requests.filter((payload) => payload.params?.[0]?.to === address)
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

  provider.respond = async ({ params }: any) => {
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
  }
}

beforeEach(() => {
  provider = new FakeProvider()
  nameResolution = createNameResolutionService(provider)
})

describe('name resolution', () => {
  it('resolves a name through its graph-owned provider proxy', async () => {
    const proxy = createProviderProxyConnection()
    const service = createProductionNameResolutionService(proxy)
    const tokenId = 1n

    proxy.on('provider:send', (payload: any) => {
      if (payload.method === 'wallet_getEthereumChains') {
        proxy.emit('payload', {
          id: payload.id,
          jsonrpc: '2.0',
          result: [{ chainId: 1, connected: true }]
        })
        return
      }

      const [{ to, data }] = payload.params
      const parsed = gnsInterface.parseTransaction({ data })
      const result =
        parsed?.name === 'computeId'
          ? gnsInterface.encodeFunctionResult('computeId', [tokenId])
          : gnsInterface.encodeFunctionResult('resolve', [gnsAddress])

      expect(to).toBe(GNS_CONTRACT)
      proxy.emit('payload', { id: payload.id, jsonrpc: '2.0', result })
    })

    service.start()
    proxy.start()

    await expect(service.resolveAddress('alice.gwei')).resolves.toBe(getAddress(gnsAddress))

    service.dispose()
    proxy.dispose()
  })

  it('resolves GNS names and bare labels without querying ENS', async () => {
    mockNameRequests({ gnsRecords: { 'alice.gwei': gnsAddress } })

    await expect(
      Promise.all([nameResolution.resolveAddress('alice.gwei'), nameResolution.resolveAddress('Alice')])
    ).resolves.toEqual([getAddress(gnsAddress), getAddress(gnsAddress)])
    expect(callsTo(GNS_CONTRACT)).toHaveLength(4)
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

  it('owns readiness listeners through an explicit start and dispose lifecycle', async () => {
    provider.respond = async ({ method }) => {
      if (method === 'wallet_getEthereumChains') {
        return [{ chainId: 1, connected: true }]
      }
      throw new Error(`Unexpected method ${method}`)
    }
    const ready = new Promise<void>((resolve) => nameResolution.once('ready', resolve))

    expect(provider.eventNames()).toEqual([])
    nameResolution.start()
    nameResolution.start()
    expect({
      chainId: provider.chainId,
      chainListeners: provider.listenerCount('chainsChanged'),
      connectListeners: provider.listenerCount('connect')
    }).toEqual({
      chainId: '0x1',
      chainListeners: 1,
      connectListeners: 1
    })

    provider.emit('connect')
    await ready
    expect(nameResolution.ready()).toBe(true)

    nameResolution.dispose()
    expect({
      chainListeners: provider.listenerCount('chainsChanged'),
      connectListeners: provider.listenerCount('connect'),
      ready: nameResolution.ready(),
      started: nameResolution.started
    }).toEqual({
      chainListeners: 0,
      connectListeners: 0,
      ready: false,
      started: false
    })
  })
})
