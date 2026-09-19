import { addHexPrefix } from '@ethereumjs/util'
import log from 'electron-log'
import { Interface } from 'ethers'
import type { BytesLike } from 'ethers'

import type { Eip1193Provider } from '../../../features/connections/main/provider/connection.js'
import type { Call, CallResult, MulticallConfig } from './constants.js'
import { abi, functionSignatureMatcher, multicallAddress } from './constants.js'

export type { Call }

const multicallInterface = new Interface(abi)
const memoizedInterfaces: Record<string, Interface> = {}

function chainConfig(chainId: number, eth: Eip1193Provider): MulticallConfig {
  return {
    chainId,
    provider: eth
  }
}

async function makeCall(data: string, config: MulticallConfig): Promise<BytesLike> {
  return config.provider.request({
    method: 'eth_call',
    params: [{ to: multicallAddress, data }, 'latest'],
    chainId: addHexPrefix(config.chainId.toString(16))
  })
}

function buildCallData<R, T>(calls: Call<R, T>[]) {
  return calls.map(({ target, call }) => {
    const [fnSignature, ...params] = call
    const fnName = getFunctionNameFromSignature(fnSignature)

    const callInterface = getInterface(fnSignature)
    const calldata = callInterface.encodeFunctionData(fnName, params)

    return [target, true, calldata]
  })
}

function isBytesLike(value: unknown): value is BytesLike {
  return typeof value === 'string' || value instanceof Uint8Array
}

function getResultData<R>(results: unknown, call: string[], target: string): R[] | undefined {
  const [fnSignature] = call
  const callInterface = memoizedInterfaces[fnSignature]
  const fnName = getFunctionNameFromSignature(fnSignature)
  try {
    if (!isBytesLike(results)) {
      throw new Error(`Invalid ${fnName} result`)
    }
    return callInterface.decodeFunctionResult(fnName, results)
  } catch (e) {
    log.warn(`Failed to decode ${fnName},`, { target, results })
    return undefined
  }
}

function getFunctionNameFromSignature(signature: string) {
  const name = signature.match(functionSignatureMatcher)?.groups?.signature

  if (!name) {
    throw new Error(`could not parse function name from signature: ${signature}`)
  }

  return name
}

function getInterface(functionSignature: string) {
  if (!(functionSignature in memoizedInterfaces)) {
    memoizedInterfaces[functionSignature] = new Interface([functionSignature])
  }

  return memoizedInterfaces[functionSignature]
}

export async function aggregate3<R, T>(
  calls: Call<R, T>[],
  execute: (calldata: string) => Promise<BytesLike>
) {
  const aggData = buildCallData(calls)
  const data = multicallInterface.encodeFunctionData('aggregate3', [aggData])
  const response = multicallInterface.decodeFunctionResult('aggregate3', await execute(data))
  if (response.returnData.length !== calls.length) {
    throw new Error('Invalid Multicall3 result count')
  }

  return calls.map(({ call, returns, target }, i) => {
    const results: unknown = response.returnData[i]
    let success: unknown
    if (Array.isArray(results)) {
      success = results[0]
    } else if (results && typeof results === 'object' && 'success' in results) {
      success = results.success
    }
    if (success !== true) {
      return { success: false, returnValues: [] }
    }

    let returnData: unknown
    if (Array.isArray(results)) {
      returnData = results[1]
    } else if (results && typeof results === 'object' && 'returnData' in results) {
      returnData = results.returnData
    }
    const resultData = getResultData<R>(returnData, call, target)
    if (!resultData) {
      return { success: false, returnValues: [] }
    }

    return {
      success: true,
      returnValues: returns.map((handler, j) => handler(resultData[j]))
    }
  })
}

// public functions
export function supportsChain(_chainId: number) {
  return true
}

export default function (chainId: number, eth: Eip1193Provider) {
  const config = chainConfig(chainId, eth)

  async function call<R, T>(calls: Call<R, T>[]): Promise<CallResult<T>[]> {
    return aggregate3(calls, (data) => makeCall(data, config))
  }

  return {
    call,
    batchCall: async function <R, T>(calls: Call<R, T>[], batchSize = 2000) {
      const numBatches = Math.ceil(calls.length / batchSize)

      const fetches = [...Array(numBatches).keys()].map(async (_, batchIndex) => {
        const batchStart = batchIndex * batchSize
        const batchEnd = batchStart + batchSize
        const batchCalls = calls.slice(batchStart, batchEnd)

        try {
          const results = await call(batchCalls)

          return results
        } catch (e) {
          log.error(
            `multicall error (batch ${batchStart}-${batchEnd}), chainId: ${chainId}, first call: ${JSON.stringify(
              calls[batchStart]
            )}`,
            e
          )
          return [...Array(batchCalls.length).keys()].map(() => ({
            success: false,
            returnValues: []
          }))
        }
      })

      const fetchResults = await Promise.all(fetches)
      const callResults = ([] as CallResult<T>[]).concat(...fetchResults)

      return callResults
    }
  }
}
