import { Interface } from 'ethers'
import { addHexPrefix } from '@ethereumjs/util'
import log from 'electron-log'

import type { BytesLike } from 'ethers'
import type { Eip1193Provider } from '../provider/connection'

import {
  abi,
  Call,
  CallResult,
  functionSignatureMatcher,
  multicallAddress,
  MulticallConfig
} from './constants'

export type { Call }

const multicallInterface = new Interface(abi)
const memoizedInterfaces: Record<string, Interface> = {}

function chainConfig(chainId: number, eth: Eip1193Provider): MulticallConfig {
  return {
    chainId,
    provider: eth
  }
}

async function makeCall(functionName: string, params: any[], config: MulticallConfig) {
  const data = multicallInterface.encodeFunctionData(functionName, params)

  const response: BytesLike = await config.provider.request({
    method: 'eth_call',
    params: [{ to: multicallAddress, data }, 'latest'],
    chainId: addHexPrefix(config.chainId.toString(16))
  })

  return multicallInterface.decodeFunctionResult(functionName, response)
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

function getResultData(results: any, call: string[], target: string) {
  const [fnSignature] = call
  const callInterface = memoizedInterfaces[fnSignature]
  const fnName = getFunctionNameFromSignature(fnSignature)
  try {
    return callInterface.decodeFunctionResult(fnName, results)
  } catch (e) {
    log.warn(`Failed to decode ${fnName},`, { target, results })
    const outputs = callInterface.getFunction(fnName)?.outputs || []
    return outputs.map(() => null)
  }
}

function getFunctionNameFromSignature(signature: string) {
  const m = signature.match(functionSignatureMatcher)

  if (!m) {
    throw new Error(`could not parse function name from signature: ${signature}`)
  }

  return (m.groups || {}).signature
}

function getInterface(functionSignature: string) {
  if (!(functionSignature in memoizedInterfaces)) {
    memoizedInterfaces[functionSignature] = new Interface([functionSignature])
  }

  return memoizedInterfaces[functionSignature]
}

async function aggregate3<R, T>(calls: Call<R, T>[], config: MulticallConfig) {
  const aggData = buildCallData(calls)
  const response = await makeCall('aggregate3', [aggData], config)

  return calls.map(({ call, returns, target }, i) => {
    const results = response.returnData[i]

    if (!results.success) {
      return { success: false, returnValues: [] }
    }

    const resultData = getResultData(results.returnData, call, target)

    return { success: true, returnValues: returns.map((handler, j) => handler(resultData[j])) }
  })
}

// public functions
export function supportsChain(_chainId: number) {
  return true
}

export default function (chainId: number, eth: Eip1193Provider) {
  const config = chainConfig(chainId, eth)

  async function call<R, T>(calls: Call<R, T>[]): Promise<CallResult<T>[]> {
    return aggregate3(calls, config)
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
          return [...Array(batchCalls.length).keys()].map(() => ({ success: false, returnValues: [] }))
        }
      })

      const fetchResults = await Promise.all(fetches)
      const callResults = ([] as CallResult<T>[]).concat(...fetchResults)

      return callResults
    }
  }
}
