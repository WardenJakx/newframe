import type { Chain, ChainId } from '@newframe/schema/chains'
import type { Gas, GasFees } from '@newframe/schema/gas'
import type { JSONRPCRequestPayload, RPCRequestCallback } from '@newframe/schema/rpc'
import type { TransactionData } from '@newframe/schema/transactions'

import type { Internet } from '../../../platform/internet/index.ts'

export type ChainRef = ChainId
type DeepReadonly<T> = T extends object ? { readonly [Key in keyof T]: DeepReadonly<T[Key]> } : T

export interface ChainRules {
  isActivatedEIP(eip: number): boolean
}

export type ChainsSnapshot = DeepReadonly<{
  chains: { ethereum: Record<number, Chain> }
  chainsMeta: { ethereum: Record<number, { gas: Gas }> }
}>

type ConnectionUpdate = Partial<Chain['connection']['primary']> & { type?: string; chain?: string }

export interface ChainsStatePort {
  read(): ChainsSnapshot
  subscribe<T>(
    selector: (state: ChainsSnapshot) => T,
    listener: () => void,
    options?: { equalityFn?: (a: T, b: T) => boolean; fireImmediately?: boolean }
  ): () => void
  setPrimary(type: 'ethereum', chainId: number, update: ConnectionUpdate): void
  setSecondary(type: 'ethereum', chainId: number, update: ConnectionUpdate): void
  setGasPrices(type: 'ethereum', chainId: number, prices: Partial<Gas['price']['levels']>): void
  setGasFees(type: 'ethereum', chainId: number, fees: GasFees | null): void
  setGasDefault(type: 'ethereum', chainId: number, level: Gas['price']['selected']): void
}

export interface LegacyChainMutations {
  remove(chain: DeepReadonly<Chain>): void
  activate(chainId: number, enabled: boolean): void
  setPrimaryRpc(chainId: number, url: string): void
}

export type ChainInternet = Pick<Internet, 'isOpen' | 'subscribe' | 'request' | 'openWebSocket'>
export type ChainTransportInternet = Pick<ChainInternet, 'request' | 'openWebSocket'>

export interface ChainEvents {
  connect: [chain: { type: 'ethereum'; id: string }, ...args: unknown[]]
  close: [chain: { type: 'ethereum'; id: string }, ...args: unknown[]]
  data: [chain: { type: 'ethereum'; id: string }, ...args: unknown[]]
  error: [chain: { type: 'ethereum'; id: string }, error: unknown]
  update: [chain: ChainRef, event: { type: string; status?: string }]
}

export interface ChainRuntime {
  hasConnection(chain: ChainRef): boolean
  isConnected(chain: ChainRef): boolean
  transactionRules(chain: ChainRef): ChainRules | undefined
  estimateL1GasCost(tx: TransactionData): Promise<bigint>
  refreshGasFees(chain: ChainRef): Promise<void>
  send(payload: JSONRPCRequestPayload, respond: RPCRequestCallback, chain?: ChainRef): void
  on<Event extends keyof ChainEvents>(event: Event, listener: (...args: ChainEvents[Event]) => void): void
  off<Event extends keyof ChainEvents>(event: Event, listener: (...args: ChainEvents[Event]) => void): void
  once<Event extends keyof ChainEvents>(event: Event, listener: (...args: ChainEvents[Event]) => void): void
  start(): void
  dispose(): void
}

export interface GatewayChainRpc {
  send(payload: JSONRPCRequestPayload, respond: RPCRequestCallback, chain?: ChainRef): void
}

type ChainReadMethod =
  | 'eth_call'
  | 'eth_chainId'
  | 'eth_getBlockByNumber'
  | 'eth_getBalance'
  | 'eth_getStorageAt'
  | 'eth_gasPrice'
  | 'debug_traceCall'
  | 'eth_getTransactionCount'
type ChainReadRequest = Omit<JSONRPCRequestPayload, 'method'> & { method: ChainReadMethod }

interface ChainsReadView {
  get(chainId: number): DeepReadonly<Chain> | undefined
  list(): readonly DeepReadonly<Chain>[]
}

export interface ChainsService extends Omit<ChainRuntime, 'send'> {
  readonly state: ChainsReadView
  read(payload: ChainReadRequest, respond: RPCRequestCallback, chain: ChainRef): void
  rpcMatchesChain(url: unknown, chainId: number): Promise<boolean>
  remove(chainId: number): boolean
  setPrimaryRpc(chainId: number, url: string): Promise<boolean>
  setActivation(chainId: number, enabled: boolean): boolean
}

export interface ChainsPorts {
  state: ChainsStatePort
  internet: ChainInternet
  legacyMutations: LegacyChainMutations
  rpcMatchesChain(url: unknown, chainId: number): Promise<boolean>
}
