import type { Eip1193Provider } from '../provider/connection'

export type CallResult<T> = { success: boolean; returnValues: T[] }
type PostProcessor<R, T> = (val: R) => T

export interface MulticallConfig {
  chainId: number
  provider: Eip1193Provider
}

export interface Call<R, T> {
  target: Address
  call: string[]
  returns: [PostProcessor<R, T>]
}

export const abi = [
  'function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[] returnData)'
]

export const functionSignatureMatcher = /function\s+(?<signature>\w+)/

export const multicallAddress: Address = '0xcA11bde05977b3631167028862bE2a173976CA11'
