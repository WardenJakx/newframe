import EventEmitter from 'events'
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

async function readUniversalResolver(
  functionName: 'resolveWithGateways' | 'reverseWithGateways',
  args: unknown[]
) {
  const data = universalResolverInterface.encodeFunctionData(functionName, args)

  const result = await provider.request<string>({
    method: 'eth_call',
    params: [{ to: UNIVERSAL_RESOLVER_ADDRESS, data }, 'latest'],
    chainId: MAINNET_CHAIN_ID
  })

  return universalResolverInterface.decodeFunctionResult(functionName, result)
}

async function resolveAddress(name: string) {
  const normalized = ensNormalize(name)
  const node = namehash(normalized)
  const data = resolverInterface.encodeFunctionData('addr', [node])
  const [result] = await readUniversalResolver('resolveWithGateways', [dnsEncode(normalized), data, GATEWAYS])
  const [address] = resolverInterface.decodeFunctionResult('addr', result)

  return address === ZeroAddress ? '' : getAddress(address)
}

async function reverseLookup(address: string) {
  if (!isAddress(address)) return ''

  const [primary] = await readUniversalResolver('reverseWithGateways', [
    getAddress(address),
    ETH_COIN_TYPE,
    GATEWAYS
  ])

  return primary
}

export default {
  once: events.once.bind(events),
  ready: () => isReady,
  resolveAddress,
  reverseLookup
}
