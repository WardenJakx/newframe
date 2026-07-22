import { afterAll, beforeAll, beforeEach, expect, it, mock } from 'bun:test'

import { Interface, toBeHex } from 'ethers'
import log from 'electron-log'

import multicall, { supportsChain } from '../../../main/multicall'

const multicall3Address = '0xcA11bde05977b3631167028862bE2a173976CA11'
const multicall3Interface = new Interface([
  'function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[] returnData)'
])
const balanceInterface = new Interface(['function balanceOf(address owner) returns (uint256 value)'])
const ownerAddress = '0x1ad91ee08f21be3de0ba2ba6918e714da6b45836'

const calls = [
  {
    target: '0x0b3F868E0BE5597D5DB7fEB59E1CADBb0fdDa50a',
    call: ['function balanceOf(address owner) returns (uint256 value)', ownerAddress],
    returns: [(bn: any) => toBeHex(bn)]
  },
  {
    target: '0xe94D89243a7Aeaf88857461ce555caEB344765Fc',
    call: ['function balanceOf(address owner) returns (uint256 value)', ownerAddress],
    returns: [(bn: any) => toBeHex(bn)]
  }
]

function encodeResults(results: { success: boolean; value?: bigint }[]) {
  return multicall3Interface.encodeFunctionResult('aggregate3', [
    results.map(({ success, value }) => [
      success,
      success ? balanceInterface.encodeFunctionResult('balanceOf', [value]) : '0x'
    ])
  ])
}

function expectAggregate3Call(payload: any, chainId: string, expectedCalls = calls) {
  expect(payload.method).toBe('eth_call')
  expect(payload.chainId).toBe(chainId)
  expect(payload.params[0].to).toBe(multicall3Address)

  const [encodedCalls] = multicall3Interface.decodeFunctionData('aggregate3', payload.params[0].data)
  expect(
    encodedCalls.map(({ target, allowFailure, callData }: any) => ({ target, allowFailure, callData }))
  ).toEqual(
    expectedCalls.map(({ target }) => ({
      target,
      allowFailure: true,
      callData: balanceInterface.encodeFunctionData('balanceOf', [ownerAddress])
    }))
  )
}

let eth: any

beforeAll(() => {
  log.transports.console.level = false
})

afterAll(() => {
  log.transports.console.level = 'debug'
})

beforeEach(() => {
  eth = { request: mock() }
})

it('uses Multicall3 aggregate3 on every chain', async () => {
  eth.request.mockImplementationOnce(async (payload: any) => {
    expectAggregate3Call(payload, '0x89')

    return encodeResults([
      { success: true, value: 6_383_378_595n },
      { success: true, value: 4_274_668_837n }
    ])
  })

  const result = await multicall(137, eth).batchCall(calls as any)

  expect(result).toEqual([
    { success: true, returnValues: ['0x017c7aa0a3'] },
    { success: true, returnValues: ['0xfeca4525'] }
  ])
  expect(supportsChain(31337)).toBe(true)
  expect(supportsChain(999999999)).toBe(true)
})

it('handles an error returned by aggregate3', async () => {
  eth.request.mockImplementationOnce(async (payload: any) => {
    expectAggregate3Call(payload, '0x1')

    return encodeResults([{ success: true, value: 6_383_379_643n }, { success: false }])
  })

  const result = await multicall(1, eth).batchCall(calls as any)

  expect(result).toEqual([
    { success: true, returnValues: ['0x017c7aa4bb'] },
    { success: false, returnValues: [] }
  ])
})

it('returns one batch if another errors', async () => {
  eth.request.mockRejectedValueOnce('multicall failed!').mockImplementationOnce(async (payload: any) => {
    expectAggregate3Call(payload, '0x89', [calls[1]])
    return encodeResults([{ success: true, value: 4_274_668_837n }])
  })

  const result = await multicall(137, eth).batchCall(calls as any, 1)

  expect(result).toEqual([
    { success: false, returnValues: [] },
    { success: true, returnValues: ['0xfeca4525'] }
  ])
})
