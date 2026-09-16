import { Interface, concat, toBeHex } from 'ethers'
import { z } from 'zod'

import type { Erc20ProviderPort } from '../../../platform/chain-rpc/contracts/erc20.js'
import type { SafeSimulationRpc, SafeStateOverrides } from '../../../platform/safe/simulation.js'
import {
  effectsFromTrace,
  isTraceCall,
  type TraceCall,
  type TransactionSimulationProjection
} from '../../transactions/main/simulation.js'
import {
  safeAddressSchema,
  safeConfigurationSchema,
  safeProposalSchema,
  type SafeConfiguration,
  type SafeProposal,
  type SafeProposalSimulation
} from '../domain/safe.js'

const abi = new Interface([
  'function getThreshold() view returns (uint256)',
  'function nonce() view returns (uint256)',
  'function getTransactionHash(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,uint256) view returns (bytes32)',
  'function execTransaction(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,bytes) payable returns (bool)',
  'event ExecutionSuccess(bytes32 txHash,uint256 payment)',
  'event ExecutionFailure(bytes32 txHash,uint256 payment)'
])
// Safe's storage layout and the wallet's unsigned execution overrides:
// https://github.com/safe-global/safe-smart-account/blob/v1.5.0/contracts/libraries/SafeStorage.sol
// https://github.com/safe-global/safe-wallet-monorepo/blob/f76d12fef41586ffbbf9e00f89d5b1cf1c63846b/packages/utils/src/components/tx/security/tenderly/utils.ts
const thresholdSlot = toBeHex(4, 32)
const nonceSlot = toBeHex(5, 32)
const guardSlot = '0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8'
const hexQuantity = z
  .string()
  .max(66)
  .regex(/^0x[0-9a-f]+$/i)
const blockSchema = z.object({ number: hexQuantity, gasLimit: hexQuantity })
const refundFields = ['safeTxGas', 'baseGas', 'gasPrice', 'gasToken', 'refundReceiver'] as const

export interface SafeSimulationInput {
  chainId: number
  address: string
  proposal: SafeProposal
}
export interface SafeSimulationPorts {
  observeConfiguration?: (configuration: SafeConfiguration, blockNumber: string) => void
  rpc: SafeSimulationRpc
  client: {
    configuration(
      chainId: number,
      address: string,
      signal?: AbortSignal,
      blockTag?: string
    ): Promise<SafeConfiguration>
  }
  projection: TransactionSimulationProjection
  provider?: Erc20ProviderPort
}

function message(error: unknown) {
  return (error instanceof Error ? error.message : 'Safe simulation unavailable').slice(0, 1000)
}

function executionEvents(trace: TraceCall, safe: string): Array<{ name: string; hash: string }> {
  if (trace.error || trace.revertReason) {
    return []
  }
  const events: Array<{ name: string; hash: string }> = []
  for (const log of trace.logs ?? []) {
    if (log.address?.toLowerCase() !== safe.toLowerCase() || !log.topics || log.data === undefined) {
      continue
    }
    const name = ['ExecutionSuccess', 'ExecutionFailure'].find(
      (name) => abi.getEvent(name)?.topicHash === log.topics?.[0]?.toLowerCase()
    )
    if (!name) {
      continue
    }
    // Safe 1.5 indexes txHash; earlier releases encode both fields in data.
    const hash =
      log.topics.length === 2 && /^0x[0-9a-f]{64}$/i.test(log.data)
        ? log.topics[1]
        : log.topics.length === 1 && /^0x[0-9a-f]{128}$/i.test(log.data)
          ? `0x${log.data.slice(2, 66)}`
          : undefined
    if (hash) {
      events.push({ name, hash: hash.toLowerCase() })
    }
  }
  return events.concat((trace.calls ?? []).flatMap((call) => executionEvents(call, safe)))
}

/** Executes the original proposal under explicit simulation-only authorization assumptions. */
export async function simulateSafeProposal(
  input: SafeSimulationInput,
  { rpc, client, projection, provider, observeConfiguration }: SafeSimulationPorts,
  signal?: AbortSignal
): Promise<SafeProposalSimulation> {
  const assumptions = [
    'Unsigned preview: owner authorization is bypassed; this does not prove the proposal can execute on-chain.'
  ]
  let currentNonce: string | undefined
  let blockNumber: string | undefined
  try {
    signal?.throwIfAborted()
    const address = safeAddressSchema.parse(input.address)
    const proposal = safeProposalSchema.parse(input.proposal)
    if (proposal.safe !== address) {
      throw new Error('Safe proposal identity mismatch')
    }
    if (!Number.isSafeInteger(input.chainId) || input.chainId <= 0) {
      throw new Error('Invalid Safe chain')
    }
    const chainId = input.chainId
    if (refundFields.some((field) => proposal[field] === undefined)) {
      throw new Error('Proposal gas or refund fields are missing. Refresh the Safe queue.')
    }
    const [rawBlock, rawPrice, rawChainId] = await Promise.all([
      rpc.request(chainId, 'eth_getBlockByNumber', ['latest', false], signal),
      rpc.request(chainId, 'eth_gasPrice', [], signal),
      rpc.request(chainId, 'eth_chainId', [], signal)
    ])
    const block = blockSchema.parse(rawBlock)
    const gasPrice = hexQuantity.parse(rawPrice)
    if (BigInt(hexQuantity.parse(rawChainId)) !== BigInt(chainId)) {
      throw new Error('Simulation RPC returned a different chain')
    }
    if (BigInt(block.gasLimit) === 0n) {
      throw new Error('Simulation block has no gas capacity')
    }
    blockNumber = BigInt(block.number).toString()
    const configuration = safeConfigurationSchema.parse(
      await client.configuration(chainId, address, signal, block.number)
    )
    signal?.throwIfAborted()
    observeConfiguration?.(configuration, blockNumber)
    currentNonce = configuration.nonce
    if (BigInt(proposal.nonce) < BigInt(currentNonce)) {
      throw new Error('Proposal nonce has already passed. Refresh the Safe queue.')
    }
    const executor = configuration.owners[0]
    const [rawGuard, rawBalance] = await Promise.all([
      rpc.request(chainId, 'eth_getStorageAt', [address, guardSlot, block.number], signal),
      rpc.request(chainId, 'eth_getBalance', [executor, block.number], signal)
    ])
    const guard = hexQuantity.parse(rawGuard)
    const balance = BigInt(hexQuantity.parse(rawBalance))
    const fields = [
      proposal.to,
      proposal.value,
      proposal.data,
      proposal.operation,
      proposal.safeTxGas,
      proposal.baseGas,
      proposal.gasPrice,
      proposal.gasToken,
      proposal.refundReceiver
    ]
    const hashResult = await rpc.call(
      chainId,
      address,
      abi.encodeFunctionData('getTransactionHash', [...fields, proposal.nonce]),
      block.number,
      signal
    )
    const expectedHash = String(abi.decodeFunctionResult('getTransactionHash', hashResult)[0]).toLowerCase()
    const stateDiff: Record<string, string> = { [thresholdSlot]: toBeHex(1, 32) }
    if (configuration.threshold !== 1) {
      assumptions.push(`Owner threshold is lowered from ${configuration.threshold} to 1 for this preview.`)
    }
    if (proposal.nonce !== currentNonce) {
      stateDiff[nonceSlot] = toBeHex(BigInt(proposal.nonce), 32)
      assumptions.push(`Nonce is set to ${proposal.nonce}; earlier queued proposals are not replayed.`)
    }
    if (BigInt(guard) !== 0n) {
      stateDiff[guardSlot] = toBeHex(0, 32)
      assumptions.push('The transaction guard is bypassed for this unsigned preview.')
    }
    const overrides: SafeStateOverrides = { [address]: { stateDiff } }
    const funding = BigInt(block.gasLimit) * BigInt(gasPrice)
    if (funding >= 2n ** 256n) {
      throw new Error('Simulation gas funding exceeds uint256')
    }
    if (balance < funding) {
      overrides[executor] = { balance: toBeHex(funding) }
      assumptions.push(
        'The executor receives temporary gas funding; contracts can observe its changed balance.'
      )
    }
    assumptions.push(
      `Executor ${executor}; gas limit ${BigInt(block.gasLimit)}, gas price ${BigInt(gasPrice)} wei. Executor and gas choices can affect guards, contracts and refunds.`
    )
    const trace = async (data: string, stateOverrides: SafeStateOverrides) => {
      const result = await rpc.request(
        chainId,
        'debug_traceCall',
        [
          { from: executor, to: address, data, value: '0x0', gas: block.gasLimit, gasPrice },
          block.number,
          { tracer: 'callTracer', tracerConfig: { withLog: true }, stateOverrides }
        ],
        signal
      )
      if (!isTraceCall(result)) {
        throw new Error('RPC returned an incomplete call trace')
      }
      if (
        result.to?.toLowerCase() !== address.toLowerCase() ||
        result.from?.toLowerCase() !== executor.toLowerCase()
      ) {
        throw new Error('RPC returned a different simulation call')
      }
      return result
    }
    // Probe tracing itself: an eth_call override alone cannot prove debug_traceCall applied it.
    const markers = {
      threshold: configuration.threshold === 1 ? 2n : 1n,
      nonce: currentNonce === '0' ? 1n : 0n
    }
    const probeOverrides: SafeStateOverrides = {
      ...overrides,
      [address]: {
        stateDiff: {
          ...stateDiff,
          [thresholdSlot]: toBeHex(markers.threshold, 32),
          [nonceSlot]: toBeHex(markers.nonce, 32)
        }
      }
    }
    await Promise.all(
      (
        [
          ['getThreshold', markers.threshold],
          ['nonce', markers.nonce]
        ] as const
      ).map(async ([method, expected]) => {
        const probe = await trace(abi.encodeFunctionData(method), probeOverrides)
        if (
          probe.error ||
          probe.revertReason ||
          !probe.output ||
          abi.decodeFunctionResult(method, probe.output)[0] !== expected
        ) {
          throw new Error('RPC storage overrides or Safe storage layout are unsupported')
        }
      })
    )
    const signature = concat([toBeHex(BigInt(executor), 32), toBeHex(0, 32), '0x01'])
    const result = await trace(abi.encodeFunctionData('execTransaction', [...fields, signature]), overrides)
    signal?.throwIfAborted()
    const context = { assumptions, currentNonce, blockNumber }
    if (result.error || result.revertReason) {
      return {
        status: 'error',
        failure: 'revert',
        error: result.revertReason || result.error || 'Safe execution reverted',
        effects: [],
        ...context
      }
    }
    if (!result.output || !/^0x0{63}[01]$/.test(result.output)) {
      throw new Error('RPC did not return the Safe execution result')
    }
    const success = abi.decodeFunctionResult('execTransaction', result.output)[0] === true
    const expectedEvent = success ? 'ExecutionSuccess' : 'ExecutionFailure'
    const events = executionEvents(result, address).filter((event) => event.hash === expectedHash)
    if (events.length !== 1 || events[0].name !== expectedEvent) {
      throw new Error(
        'RPC trace lacks matching Safe execution logs; complete simulation effects are unavailable'
      )
    }
    const effects = await effectsFromTrace(
      result,
      { account: address, data: { chainId: toBeHex(chainId), to: proposal.to } },
      projection.getNativeCurrency(chainId),
      projection,
      rpc.metadataProvider?.(chainId, block.number, signal) ?? provider
    )
    signal?.throwIfAborted()
    return success
      ? { status: 'success', effects, ...context }
      : {
          status: 'error',
          failure: 'inner',
          error: 'Safe execution completed, but the proposed call failed. Refund effects may remain.',
          effects,
          ...context
        }
  } catch (error) {
    return {
      status: 'unavailable',
      error: message(error),
      assumptions,
      ...(currentNonce === undefined ? {} : { currentNonce }),
      ...(blockNumber === undefined ? {} : { blockNumber })
    }
  }
}
