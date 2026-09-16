import { expect, it } from 'bun:test'

import { Interface, ZeroAddress, toBeHex } from 'ethers'

import type { SafeConfiguration, SafeProposal } from '../domain/safe'
import { simulateSafeProposal, type SafeSimulationPorts } from './safeSimulation'

const safe = '0x1111111111111111111111111111111111111111'
const owner = '0x2222222222222222222222222222222222222222'
const hash = `0x${'a'.repeat(64)}`
const abi = new Interface([
  'function getThreshold() view returns(uint)',
  'function nonce() view returns(uint)',
  'function getTransactionHash(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,uint256) view returns(bytes32)',
  'function execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes) returns(bool)',
  'event ExecutionSuccess(bytes32 txHash,uint256 payment)'
])
const proposal: SafeProposal = {
  safe,
  safeTxHash: hash,
  to: owner,
  value: '10',
  data: '0x',
  operation: 0,
  nonce: '7',
  safeTxGas: '12345',
  baseGas: '21000',
  gasPrice: '123',
  gasToken: ZeroAddress,
  refundReceiver: owner,
  confirmations: []
}

function setup({ indexed = false, wrongHash = false, ignoredOverrides = false, malformed = false } = {}) {
  const calls: { method: string; params: unknown[] }[] = []
  const ports: SafeSimulationPorts = {
    client: {
      configuration: async (_chain, _address, _signal, block) => {
        expect(block).toBe('0x64')
        return {
          owners: [owner, '0x3333333333333333333333333333333333333333'],
          threshold: 2,
          nonce: '0',
          version: 'custom-compatible'
        }
      }
    },
    projection: { getNativeCurrency: () => ({ symbol: 'ETH', decimals: 18 }), getToken: () => undefined },
    rpc: {
      call: async (_chain, _address, input) => {
        expect(abi.parseTransaction({ data: input })?.args[9]).toBe(7n)
        return abi.encodeFunctionResult('getTransactionHash', [hash])
      },
      request: async (_chain, method, params) => {
        calls.push({ method, params })
        if (method === 'eth_chainId') {
          return '0x1'
        }
        if (method === 'eth_getBlockByNumber') {
          return { number: '0x64', gasLimit: '0x7a120' }
        }
        if (method === 'eth_gasPrice') {
          return '0x64'
        }
        if (method === 'eth_getBalance' || method === 'eth_getStorageAt') {
          return '0x0'
        }
        if (method !== 'debug_traceCall') {
          throw Error('Unexpected method')
        }
        const [call, , options] = params as [
          { data: string },
          string,
          { stateOverrides: Record<string, { stateDiff: Record<string, string> }> }
        ]
        const tx = abi.parseTransaction({ data: call.data })!
        if (tx.name !== 'execTransaction') {
          const slot = toBeHex(tx.name === 'getThreshold' ? 4 : 5, 32)
          return {
            type: 'CALL',
            from: owner,
            to: safe,
            output:
              options.stateOverrides[safe].stateDiff[slot] && !ignoredOverrides
                ? options.stateOverrides[safe].stateDiff[slot]
                : toBeHex(99, 32)
          }
        }
        expect([...tx.args].slice(0, 9)).toEqual([
          owner,
          10n,
          '0x',
          0n,
          12345n,
          21000n,
          123n,
          ZeroAddress,
          owner
        ])
        const event = abi.encodeEventLog(abi.getEvent('ExecutionSuccess')!, [
          wrongHash ? `0x${'b'.repeat(64)}` : hash,
          0
        ])
        const logs = [
          {
            address: safe,
            topics: indexed ? [...event.topics, hash] : event.topics,
            data: indexed ? toBeHex(0, 32) : event.data
          }
        ]
        return {
          type: 'CALL',
          from: owner,
          to: safe,
          output: malformed ? '0x' : abi.encodeFunctionResult('execTransaction', [true]),
          logs,
          calls: [
            {
              type: 'CALL',
              from: safe,
              to: owner,
              value: '0xa',
              input: '0x'
            }
          ]
        }
      }
    }
  }
  return { ports, calls }
}

it('preserves every signed field, accepts compatible unknown versions and both Safe execution event formats', async () => {
  for (const indexed of [true, false]) {
    const { ports } = setup({ indexed })
    const result = await simulateSafeProposal({ chainId: 1, address: safe, proposal }, ports)
    expect(result).toMatchObject({
      status: 'success',
      currentNonce: '0',
      blockNumber: '100',
      effects: [{ kind: 'native', direction: 'out', amount: '0xa' }]
    })
    expect(result.assumptions?.join(' ')).toContain('Nonce is set to 7')
    expect(result.assumptions?.join(' ')).toContain('temporary gas funding')
  }
})

it('requires matching execution logs and a Safe return value, and rejects ignored trace overrides', async () => {
  for (const options of [{ wrongHash: true }, { malformed: true }, { ignoredOverrides: true }]) {
    const { ports } = setup(options)
    expect(await simulateSafeProposal({ chainId: 1, address: safe, proposal }, ports)).toMatchObject({
      status: 'unavailable'
    })
  }
})

it('rejects missing signed fields before RPC and stale proposals before execution', async () => {
  const { ports, calls } = setup()
  let observed: { configuration: SafeConfiguration; blockNumber: string } | undefined
  ports.observeConfiguration = (configuration, blockNumber) => {
    observed = { configuration, blockNumber }
  }
  expect(
    await simulateSafeProposal(
      { chainId: 1, address: safe, proposal: { ...proposal, gasPrice: undefined } },
      ports
    )
  ).toMatchObject({ status: 'unavailable' })
  expect(calls).toHaveLength(0)
  expect(observed).toBeUndefined()
  ports.client.configuration = async () => ({ owners: [owner], threshold: 1, nonce: '8' })
  expect(await simulateSafeProposal({ chainId: 1, address: safe, proposal }, ports)).toMatchObject({
    status: 'unavailable',
    currentNonce: '8'
  })
  expect(calls.some(({ method }) => method === 'debug_traceCall')).toBeFalse()
  expect(observed).toEqual({
    configuration: { owners: [owner], threshold: 1, nonce: '8' },
    blockNumber: '100'
  })
})
