import { expect, it } from 'bun:test'

import { Interface, getAddress } from 'ethers'

import Erc20Contract from '../../../core/services/chains/rpc/contracts/erc20.ts'
import type { Callback } from '../../../shared/domain/async.ts'
import type { RPCRequestPayload, RPCResponsePayload } from '../../../shared/domain/rpc.ts'
import { resolveWatchAsset } from './watchAsset.ts'

const address = getAddress('0xbfa641051ba0a0ad1b0acf549a89536a0d76472e')
const token = new Interface([
  'function decimals() view returns (uint8)',
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function totalSupply() view returns (uint256)',
  'function tokenURI() view returns (string)'
])
const multicall = new Interface([
  'function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[] returnData)'
])

it('reads ERC-1046 metadata in one Multicall3 eth_call', async () => {
  const metadata = { interop: { erc1046: true }, name: 'BadgerDAO Token', symbol: 'BADGER', decimals: 18 }
  const values: Record<string, unknown[]> = {
    decimals: [18],
    name: ['BadgerDAO Token'],
    symbol: ['BADGER'],
    totalSupply: [1000n],
    tokenURI: [`data:application/json,${encodeURIComponent(JSON.stringify(metadata))}`]
  }
  let ethCalls = 0
  const provider = {
    sendAsync(payload: RPCRequestPayload, callback: Callback<RPCResponsePayload>) {
      if (payload.method !== 'eth_call' || !Array.isArray(payload.params)) {
        throw new Error('Unexpected RPC request')
      }
      ethCalls += 1
      const transaction = payload.params[0] as { data: string }
      const decoded = multicall.decodeFunctionData('aggregate3', transaction.data)
      const calls = decoded[0] as Array<{ callData: string }>
      const results = calls.map(({ callData }) => {
        const fragment = token.getFunction(callData.slice(0, 10))
        if (!fragment) {
          throw new Error('Unknown token call')
        }
        return { success: true, returnData: token.encodeFunctionResult(fragment, values[fragment.name]) }
      })
      callback(null, {
        id: payload.id,
        jsonrpc: '2.0',
        result: multicall.encodeFunctionResult('aggregate3', [results])
      })
    }
  }

  const result = await resolveWatchAsset(address.toLowerCase(), 1, 'ERC1046', {}, provider)
  expect(result).toMatchObject({
    address: address.toLowerCase(),
    chainId: 1,
    name: 'BadgerDAO Token',
    symbol: 'BADGER',
    decimals: 18
  })
  expect(ethCalls).toBe(1)
})

it('does not fan out into individual calls after an RPC rate limit error', async () => {
  let ethCalls = 0
  const provider = {
    sendAsync(payload: RPCRequestPayload, callback: Callback<RPCResponsePayload>) {
      ethCalls += 1
      callback(null, {
        id: payload.id,
        jsonrpc: '2.0',
        error: { code: -32005, message: 'Rate limit exceeded' }
      })
    }
  }
  expect(new Erc20Contract(address, 1, provider).getTokenData()).rejects.toThrow()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(ethCalls).toBe(1)
})
