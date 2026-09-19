import EventEmitter from 'events'

import { GNS_CONTRACT, gnsAbi, isGwei, normalizeName } from '@donnoh/gns-utils'
import { Interface, ZeroAddress, dnsEncode, ensNormalize, getAddress, isAddress, namehash } from 'ethers'
import type { BytesLike, Result } from 'ethers'

import { createProxyProvider } from '../../connections/main/provider/connection.js'
import type { ProviderProxyConnection } from '../../connections/main/provider/proxy.js'

const MAINNET_CHAIN_ID = '0x1'
const UNIVERSAL_RESOLVER_ADDRESS = '0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe'
const ETH_COIN_TYPE = 60n
const GATEWAYS: string[] = []

const universalResolverInterface = new Interface([
  'function resolveWithGateways(bytes name, bytes data, string[] gateways) view returns (bytes result, address resolver)',
  'function reverseWithGateways(bytes lookupAddress, uint256 coinType, string[] gateways) view returns (string primary, address resolver, address reverseResolver)'
])
const resolverInterface = new Interface(['function addr(bytes32 node) view returns (address)'])
const gnsInterface = new Interface(gnsAbi)

export interface NameResolutionProviderPort {
  setChain(chainId: string): void
  on(event: string, listener: (...args: any[]) => void): unknown
  once(event: string, listener: (...args: any[]) => void): unknown
  off(event: string, listener: (...args: any[]) => void): unknown
  request<T>(payload: { method: string; params?: unknown[]; chainId?: string }): Promise<T>
}

export interface NameResolutionService {
  readonly started: boolean
  start(): void
  dispose(): void
  ready(): boolean
  once(event: 'ready', listener: () => void): unknown
  off(event: 'ready', listener: () => void): unknown
  resolveAddress(name: string): Promise<string>
  reverseLookup(address: string): Promise<string>
}

export function createNameResolutionService(
  providerSource: NameResolutionProviderPort | (() => NameResolutionProviderPort)
): NameResolutionService {
  const events = new EventEmitter()
  let provider: NameResolutionProviderPort | undefined
  let active = false
  let disposed = false
  let isReady = false

  const getProvider = () => {
    provider ??= typeof providerSource === 'function' ? providerSource() : providerSource
    return provider
  }

  const isMainnetConnected = (chains: RPC.GetEthereumChains.Chain[]) =>
    !!chains.find((chain) => chain.chainId === 1)?.connected

  const readyHandler = (chains: RPC.GetEthereumChains.Chain[]) => {
    if (!active || !isMainnetConnected(chains)) {
      return
    }

    getProvider().off('chainsChanged', readyHandler)
    isReady = true
    events.emit('ready')
  }

  const checkConnectedChains = async () => {
    if (!active) {
      return
    }

    try {
      const activeChains = await getProvider().request<RPC.GetEthereumChains.Chain[]>({
        method: 'wallet_getEthereumChains'
      })
      readyHandler(activeChains)
    } catch {
      // Mainnet is either disabled or not connected yet; call sites handle lookup failures.
    }
  }

  const connectHandler = () => {
    // An unavailable mainnet is handled inside checkConnectedChains.
    void checkConnectedChains()
  }

  async function readMainnetContract(to: string, data: string) {
    return getProvider().request<string>({
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

  const resultValue = (result: Result, index: number): unknown => result[index]
  const isBytesLike = (value: unknown): value is BytesLike =>
    typeof value === 'string' || value instanceof Uint8Array

  function isGnsName(name: string) {
    const input = name.trim()
    return !!input && (isGwei(input) || !input.includes('.'))
  }

  async function resolveGnsAddress(name: string) {
    try {
      const tokenId = resultValue(await readGns('computeId', [normalizeName(name)]), 0)
      if (typeof tokenId !== 'bigint') {
        return ''
      }
      if (tokenId === 0n) {
        return ''
      }

      const address = resultValue(await readGns('resolve', [tokenId]), 0)
      if (typeof address !== 'string') {
        return ''
      }
      return address === ZeroAddress ? '' : getAddress(address)
    } catch {
      return ''
    }
  }

  async function resolveEnsAddress(name: string) {
    const normalized = ensNormalize(name)
    const node = namehash(normalized)
    const data = resolverInterface.encodeFunctionData('addr', [node])
    const result = resultValue(
      await readUniversalResolver('resolveWithGateways', [dnsEncode(normalized), data, GATEWAYS]),
      0
    )
    if (!isBytesLike(result)) {
      return ''
    }
    const address = resultValue(resolverInterface.decodeFunctionResult('addr', result), 0)
    if (typeof address !== 'string') {
      return ''
    }

    return address === ZeroAddress ? '' : getAddress(address)
  }

  async function resolveAddress(name: string) {
    const input = name.trim()
    if (!input) {
      return ''
    }
    return isGnsName(input) ? resolveGnsAddress(input) : resolveEnsAddress(input)
  }

  async function reverseGnsLookup(address: string) {
    try {
      if (!isAddress(address)) {
        return ''
      }
      const primary = resultValue(await readGns('reverseResolve', [getAddress(address)]), 0)
      return typeof primary === 'string' ? primary : ''
    } catch {
      return ''
    }
  }

  async function reverseEnsLookup(address: string) {
    if (!isAddress(address)) {
      return ''
    }
    const primary = resultValue(
      await readUniversalResolver('reverseWithGateways', [getAddress(address), ETH_COIN_TYPE, GATEWAYS]),
      0
    )
    return typeof primary === 'string' ? primary : ''
  }

  async function reverseLookup(address: string) {
    const gnsName = await reverseGnsLookup(address)
    if (gnsName) {
      return gnsName
    }
    return reverseEnsLookup(address)
  }

  return {
    get started() {
      return active
    },
    start() {
      if (active || disposed) {
        return
      }

      active = true
      const activeProvider = getProvider()
      activeProvider.setChain(MAINNET_CHAIN_ID)
      activeProvider.on('chainsChanged', readyHandler)
      activeProvider.once('connect', connectHandler)
    },
    dispose() {
      if (disposed) {
        return
      }

      active = false
      disposed = true
      isReady = false
      provider?.off('chainsChanged', readyHandler)
      provider?.off('connect', connectHandler)
      events.removeAllListeners()
    },
    ready: () => isReady,
    once: events.once.bind(events),
    off: events.off.bind(events),
    resolveAddress,
    reverseLookup
  }
}

export function createProductionNameResolutionService(proxy: ProviderProxyConnection) {
  return createNameResolutionService(() => createProxyProvider(proxy))
}
