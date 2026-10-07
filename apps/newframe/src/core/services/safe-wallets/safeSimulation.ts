import { Interface, concat, toBeHex, toQuantity } from 'ethers'
import { z } from 'zod'

import {
  safeAddressSchema,
  safeConfigurationSchema,
  safeProposalSchema,
  type SafeConfiguration,
  type SafeProposal,
  type SafeProposalSimulation
} from '../../../features/accounts/domain/safe.ts'
import {
  effectsFromLogs,
  simulatedCalls,
  simulationParams,
  type SimulatedLog,
  type SimulationStateOverrides,
  type TransactionSimulationProjection
} from '../../../features/transactions/main/simulation.ts'
import type { Erc20ProviderPort } from '../chains/rpc/contracts/erc20.ts'
import type { SafeSimulationRpc } from './simulation.ts'

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
// Both view probes share one simulated block, so neither may claim the block's whole gas limit.
const probeGas = 200_000n
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

function executionEvents(logs: SimulatedLog[], safe: string): Array<{ name: string; hash: string }> {
  const events: Array<{ name: string; hash: string }> = []
  for (const log of logs) {
    if (log.address.toLowerCase() !== safe.toLowerCase()) {
      continue
    }
    const name = ['ExecutionSuccess', 'ExecutionFailure'].find(
      (name) => abi.getEvent(name)?.topicHash === log.topics[0]?.toLowerCase()
    )
    if (!name) {
      continue
    }
    // Safe 1.5 indexes txHash; earlier releases encode both fields in data.
    let hash: string | undefined
    if (log.topics.length === 2 && /^0x[0-9a-f]{64}$/i.test(log.data)) {
      hash = log.topics[1]
    } else if (log.topics.length === 1 && /^0x[0-9a-f]{128}$/i.test(log.data)) {
      hash = `0x${log.data.slice(2, 66)}`
    }
    if (hash) {
      events.push({ name, hash: hash.toLowerCase() })
    }
  }
  return events
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
    const overrides: SimulationStateOverrides = { [address]: { stateDiff } }
    const funding = BigInt(block.gasLimit) * BigInt(gasPrice)
    if (funding >= 2n ** 256n) {
      throw new Error('Simulation gas funding exceeds uint256')
    }
    if (balance < funding) {
      overrides[executor] = { balance: toQuantity(funding) }
      assumptions.push(
        'The executor receives temporary gas funding; contracts can observe its changed balance.'
      )
    }
    assumptions.push(
      `Executor ${executor}; gas limit ${BigInt(block.gasLimit)}, gas price ${BigInt(gasPrice)} wei. Executor and gas choices can affect guards, contracts and refunds.`
    )
    const simulate = async (
      data: string[],
      stateOverrides: SimulationStateOverrides,
      gas = block.gasLimit
    ) => {
      const calls = data.map((input) => ({ from: executor, to: address, data: input, gas, gasPrice }))
      return simulatedCalls(
        await rpc.request(
          chainId,
          'eth_simulateV1',
          simulationParams(calls, block.number, stateOverrides),
          signal
        ),
        calls.length
      )
    }
    // Probe the simulation itself: an eth_call override alone cannot prove eth_simulateV1 applied it.
    const markers = {
      threshold: configuration.threshold === 1 ? 2n : 1n,
      nonce: currentNonce === '0' ? 1n : 0n
    }
    const probeOverrides: SimulationStateOverrides = {
      ...overrides,
      [address]: {
        stateDiff: {
          ...stateDiff,
          [thresholdSlot]: toBeHex(markers.threshold, 32),
          [nonceSlot]: toBeHex(markers.nonce, 32)
        }
      }
    }
    const signature = concat([toBeHex(BigInt(executor), 32), toBeHex(0, 32), '0x01'])
    const [probes, [result]] = await Promise.all([
      simulate(
        [abi.encodeFunctionData('getThreshold'), abi.encodeFunctionData('nonce')],
        probeOverrides,
        toQuantity(probeGas)
      ),
      simulate([abi.encodeFunctionData('execTransaction', [...fields, signature])], overrides)
    ])
    signal?.throwIfAborted()
    if (
      probes.some((probe) => probe.status !== '0x1') ||
      abi.decodeFunctionResult('getThreshold', probes[0].returnData)[0] !== markers.threshold ||
      abi.decodeFunctionResult('nonce', probes[1].returnData)[0] !== markers.nonce
    ) {
      throw new Error('RPC storage overrides or Safe storage layout are unsupported')
    }
    const context = { assumptions, currentNonce, blockNumber }
    if (result.status === '0x0') {
      return {
        status: 'error',
        failure: 'revert',
        error: result.error?.message ?? 'Safe execution reverted',
        effects: [],
        ...context
      }
    }
    if (!/^0x0{63}[01]$/.test(result.returnData)) {
      throw new Error('RPC did not return the Safe execution result')
    }
    const success = abi.decodeFunctionResult('execTransaction', result.returnData)[0] === true
    const expectedEvent = success ? 'ExecutionSuccess' : 'ExecutionFailure'
    const events = executionEvents(result.logs, address).filter((event) => event.hash === expectedHash)
    if (events.length !== 1 || events[0].name !== expectedEvent) {
      throw new Error(
        'RPC simulation lacks matching Safe execution logs; complete simulation effects are unavailable'
      )
    }
    const effects = await effectsFromLogs(
      result.logs,
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
