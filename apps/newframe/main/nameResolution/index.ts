import EventEmitter from 'events'
import { GNS_CONTRACT, gnsAbi, isGwei, normalizeName } from '@donnoh/gns-utils'
import { Interface, ZeroAddress, dnsEncode, ensNormalize, getAddress, isAddress, namehash } from 'ethers'

import proxyConnection from '../provider/proxy'
import { createProxyProvider } from '../provider/connection'

const MAINNET_CHAIN_ID = '0x1'
const UNIVERSAL_RESOLVER_ADDRESS = '0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe'
const ETH_COIN_TYPE = 60n
const GATEWAYS: string[] = []

const provider = createProxyProvider(proxyConnection)
provider.setChain(MAINNET_CHAIN_ID)

const events = new EventEmitter()
let isReady = false

const universalResolverInterface = new Interface([
  'function resolveWithGateways(bytes name, bytes data, string[] gateways) view returns (bytes result, address resolver)',
  'function reverseWithGateways(bytes lookupAddress, uint256 coinType, string[] gateways) view returns (string primary, address resolver, address reverseResolver)'
])

const resolverInterface = new Interface(['function addr(bytes32 node) view returns (address)'])
const gnsInterface = new Interface(gnsAbi)

const isMainnetConnected = (chains: RPC.GetEthereumChains.Chain[]) =>
  !!chains.find((chain) => chain.chainId === 1)?.connected

const readyHandler = (chains: RPC.GetEthereumChains.Chain[]) => {
  if (isMainnetConnected(chains)) {
    provider.off('chainsChanged', readyHandler)

    isReady = true
    events.emit('ready')
  }
}

provider.on('chainsChanged', readyHandler)

provider.once('connect', async () => {
  try {
    const activeChains = await provider.request<RPC.GetEthereumChains.Chain[]>({
      method: 'wallet_getEthereumChains'
    })

    readyHandler(activeChains)
  } catch {
    // Mainnet is either disabled or not connected yet; call sites handle lookup failures.
  }
})

async function readMainnetContract(to: string, data: string) {
  return provider.request<string>({
    method: 'eth_call',
    params: [{ to, data }, 'latest'],
    chainId: MAINNET_CHAIN_ID
  })
}

async function readUniversalResolver(
  functionName: 'resolveWithGateways' | 'reverseWithGateways',
  args: unknown[]
) {
  const data = universalResolverInterface.encodeFunctionData(functionName, args)
  const result = await readMainnetContract(UNIVERSAL_RESOLVER_ADDRESS, data)

  return universalResolverInterface.decodeFunctionResult(functionName, result)
}

async function readGns(functionName: 'computeId' | 'resolve' | 'reverseResolve', args: unknown[]) {
  const data = gnsInterface.encodeFunctionData(functionName, args)
  const result = await readMainnetContract(GNS_CONTRACT, data)

  return gnsInterface.decodeFunctionResult(functionName, result)
}

function isGnsName(name: string) {
  const input = name.trim()

  return !!input && (isGwei(input) || !input.includes('.'))
}

async function resolveGnsAddress(name: string) {
  try {
    const [tokenId] = await readGns('computeId', [normalizeName(name)])
    if (tokenId === 0n) return ''

    const [address] = await readGns('resolve', [tokenId])

    return address === ZeroAddress ? '' : getAddress(address)
  } catch {
    return ''
  }
}

async function resolveEnsAddress(name: string) {
  const normalized = ensNormalize(name)
  const node = namehash(normalized)
  const data = resolverInterface.encodeFunctionData('addr', [node])
  const [result] = await readUniversalResolver('resolveWithGateways', [dnsEncode(normalized), data, GATEWAYS])
  const [address] = resolverInterface.decodeFunctionResult('addr', result)

  return address === ZeroAddress ? '' : getAddress(address)
}

async function resolveAddress(name: string) {
  const input = name.trim()
  if (!input) return ''

  if (isGnsName(input)) return resolveGnsAddress(input)

  return resolveEnsAddress(input)
}

async function reverseGnsLookup(address: string) {
  try {
    if (!isAddress(address)) return ''

    const [primary] = await readGns('reverseResolve', [getAddress(address)])

    return primary || ''
  } catch {
    return ''
  }
}

async function reverseEnsLookup(address: string) {
  if (!isAddress(address)) return ''

  const [primary] = await readUniversalResolver('reverseWithGateways', [
    getAddress(address),
    ETH_COIN_TYPE,
    GATEWAYS
  ])

  return primary
}

async function reverseLookup(address: string) {
  const gnsName = await reverseGnsLookup(address)
  if (gnsName) return gnsName

  return reverseEnsLookup(address)
}

export default {
  once: events.once.bind(events),
  ready: () => isReady,
  resolveAddress,
  reverseLookup
}
