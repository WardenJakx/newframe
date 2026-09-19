import { afterAll, beforeAll, expect, it } from 'bun:test'
import { createRequire } from 'node:module'
import { createServer } from 'node:net'

import {
  Contract,
  ContractFactory,
  Interface,
  JsonRpcProvider,
  NonceManager,
  ZeroAddress,
  concat,
  id,
  toBeHex,
  toQuantity,
  type ContractTransactionResponse,
  type InterfaceAbi
} from 'ethers'
import { subscribeWithSelector } from 'zustand/middleware'
import { createStore } from 'zustand/vanilla'

import { seedSafe, type SafeSeedManifest } from '../../../../harness/newframe/services/safe-contracts'
import { createSafeHandler } from '../../scripts/local-safe/handler'
import type { SafeProposal } from '../../src/features/accounts/domain/safe'
import { createSafeService } from '../../src/features/accounts/main/safe'
import { simulateSafeProposal } from '../../src/features/accounts/main/safeSimulation'
import {
  createTransactionSimulationProjection,
  type TraceCall
} from '../../src/features/transactions/main/simulation'
import { createOperationService } from '../../src/platform/operations/service'
import { createSafeClient } from '../../src/platform/safe/client'
import { createSafeSimulationRpc } from '../../src/platform/safe/simulation'
import { createTestStore } from '../support/createTestStore'

// Anvil and official Safe contracts are the same local dependencies as the visual harness.
// Run explicitly with test:integration:safe-simulation; no external chain or user keys.
const chainId = 31337
const recipient = '0x0000000000000000000000000000000000001234'
const observerOwner = '0x0000000000000000000000000000000000002345'
const newOwner = '0x0000000000000000000000000000000000003456'
const guard = '0x0000000000000000000000000000000000004567'
const guardSlot = id('guard_manager.guard.address')
const safeAbi = new Interface([
  'function getTransactionHash(address,uint256,bytes,uint8,uint256,uint256,uint256,address,address,uint256) view returns (bytes32)',
  'function getOwners() view returns (address[])',
  'function getThreshold() view returns (uint256)',
  'function nonce() view returns (uint256)',
  'function addOwnerWithThreshold(address,uint256)'
])
const tokenAbi = new Interface([
  'function mint(address,uint256)',
  'function transfer(address,uint256) returns (bool)',
  'function transferFrom(address,address,uint256) returns (bool)',
  'function approve(address,uint256) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
  'function allowance(address,address) view returns (uint256)'
])
const batchAbi = new Interface(['function multiSend(bytes) payable'])
let anvil: ReturnType<typeof Bun.spawn> | undefined
let provider: JsonRpcProvider
let seed: SafeSeedManifest
let token: Contract & {
  mint(address: string, amount: bigint): Promise<ContractTransactionResponse>
}
let tokenAddress: string
let multiSend: string
let service: ReturnType<typeof createSafeService>
let rpc: ReturnType<typeof createSafeSimulationRpc>
let unsubscribe: () => void
let proposals: Record<string, SafeProposal>
let traceMode: 'normal' | 'unavailable' | 'no-logs' = 'normal'
const requests: string[] = []
const traces: TraceCall[] = []
const base = createTestStore()
const selectors = createStore(subscribeWithSelector(() => base.getState()))
const store = { ...base.store, subscribe: selectors.subscribe }
const projection = createTransactionSimulationProjection(store)

function batch(calls: { to: string; value?: bigint; data?: string }[]) {
  return batchAbi.encodeFunctionData('multiSend', [
    concat(
      calls.map(({ to, value = 0n, data = '0x' }) =>
        concat(['0x00', to, toBeHex(value, 32), toBeHex((data.length - 2) / 2, 32), data])
      )
    )
  ])
}

async function liveState() {
  const safe = new Contract(seed.safe, safeAbi, provider)
  return Promise.all([
    safe.getOwners(),
    safe.getThreshold(),
    safe.nonce(),
    provider.send('eth_getStorageAt', [seed.safe, guardSlot, 'latest']),
    provider.send('eth_getBalance', [seed.safe, 'latest']),
    provider.send('eth_getBalance', [observerOwner, 'latest']),
    provider.send('eth_getBalance', [recipient, 'latest']),
    token.balanceOf(seed.safe),
    token.balanceOf(recipient),
    token.allowance(seed.safe, recipient),
    token.allowance(seed.safe, seed.safe)
  ])
}

async function preview(name: string) {
  const accountId = seed.safe.toLowerCase()
  const before = JSON.stringify(store.getState().main.accounts[accountId])
  const chainBefore = await liveState()
  requests.length = 0
  traces.length = 0
  const result = await service.simulate({
    type: 'safe.simulate',
    accountId,
    chainId,
    safeTxHash: proposals[name].safeTxHash
  })
  expect(JSON.stringify(store.getState().main.accounts[accountId])).toBe(before)
  expect(await liveState()).toEqual(chainBefore)
  expect(
    requests.every(
      (method) =>
        method.startsWith('eth_get') ||
        method === 'eth_call' ||
        method === 'eth_chainId' ||
        method === 'eth_gasPrice' ||
        method === 'debug_traceCall'
    )
  ).toBe(true)
  return result
}

async function executed(name: string) {
  const result = await preview(name)
  if (result.status === 'unavailable') {
    throw new Error(result.error)
  }
  return result
}

function logs(trace: TraceCall): NonNullable<TraceCall['logs']> {
  if (trace.error || trace.revertReason) {
    return []
  }
  return [...(trace.logs ?? []), ...(trace.calls ?? []).flatMap(logs)]
}

beforeAll(async () => {
  const listener = createServer()
  await new Promise<void>((resolve, reject) => {
    listener.once('error', reject)
    listener.listen(0, '127.0.0.1', resolve)
  })
  const address = listener.address()
  if (!address || typeof address === 'string') {
    throw new Error('Unable to reserve Anvil port')
  }
  await new Promise<void>((resolve, reject) => listener.close((error) => (error ? reject(error) : resolve())))
  anvil = Bun.spawn(
    [
      'anvil',
      '--host',
      '127.0.0.1',
      '--port',
      String(address.port),
      '--chain-id',
      String(chainId),
      '--silent'
    ],
    { stdout: 'ignore', stderr: 'pipe' }
  )
  const url = `http://127.0.0.1:${address.port}`
  let ready = false
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] })
      })
      ready = Number(((await response.json()) as { result: string }).result) === chainId
      if (ready) {
        break
      }
    } catch {
      /* Anvil is starting. */
    }
    await Bun.sleep(25)
  }
  if (!ready) {
    throw new Error('Local Anvil did not start')
  }
  provider = new JsonRpcProvider(url, chainId, {
    staticNetwork: true,
    batchMaxCount: 1,
    cacheTimeout: -1,
    pollingInterval: 10
  })
  const signer = new NonceManager(await provider.getSigner(0))
  seed = await seedSafe(provider, signer, chainId, observerOwner)
  const tokenArtifact = (await Bun.file(
    new URL('../../../../newframe-contracts/out/MockUSDC.sol/MockUSDC.json', import.meta.url)
  ).json()) as { abi: InterfaceAbi; bytecode: { object: string } }
  const deployedToken = await new ContractFactory(
    tokenArtifact.abi,
    tokenArtifact.bytecode.object,
    signer
  ).deploy()
  await deployedToken.waitForDeployment()
  tokenAddress = await deployedToken.getAddress()
  token = new Contract(tokenAddress, tokenAbi, signer) as typeof token
  const harnessRequire = createRequire(new URL('../../../../harness/package.json', import.meta.url))
  const multiSendArtifact = (await Bun.file(
    harnessRequire.resolve(
      '@safe-global/safe-smart-account/build/artifacts/contracts/libraries/MultiSend.sol/MultiSend.json'
    )
  ).json()) as { abi: InterfaceAbi; bytecode: string }
  const deployedBatch = await new ContractFactory(
    multiSendArtifact.abi,
    multiSendArtifact.bytecode,
    signer
  ).deploy()
  await deployedBatch.waitForDeployment()
  multiSend = await deployedBatch.getAddress()
  const mintTransaction = await token.mint(seed.safe, 1_000_000n)
  await mintTransaction.wait()
  await provider.send('anvil_setBalance', [seed.safe, toQuantity(10n ** 18n)])
  // A rejecting guard demonstrates the preview does not require an extension-free Safe.
  await provider.send('anvil_setCode', [guard, '0x60006000fd'])
  await provider.send('anvil_setStorageAt', [seed.safe, guardSlot, toBeHex(BigInt(guard), 32)])
  const transfer = (amount: bigint) => tokenAbi.encodeFunctionData('transfer', [recipient, amount])
  const rollback = batch([
    { to: recipient, value: 35n },
    { to: tokenAddress, data: transfer(100n) },
    { to: tokenAddress, data: transfer(2_000_000n) }
  ])
  const cases: Record<string, Partial<SafeProposal>> = {
    native: { value: '10000' },
    token: { to: tokenAddress, data: transfer(1000n), confirmations: [seed.owners[1]] },
    approval: { to: tokenAddress, data: tokenAbi.encodeFunctionData('approve', [recipient, 200n]) },
    batch: {
      to: multiSend,
      operation: 1,
      value: '99',
      data: batch([
        { to: recipient, value: 25n },
        { to: seed.safe, value: 7n },
        { to: tokenAddress, data: transfer(250n) },
        { to: tokenAddress, data: tokenAbi.encodeFunctionData('approve', [recipient, 300n]) }
      ])
    },
    future: { nonce: '4', value: '12' },
    configuration: {
      to: seed.safe,
      data: safeAbi.encodeFunctionData('addOwnerWithThreshold', [newOwner, 2])
    },
    configurationBatch: {
      to: multiSend,
      operation: 1,
      data: batch([
        { to: seed.safe, data: safeAbi.encodeFunctionData('addOwnerWithThreshold', [newOwner, 2]) },
        { to: tokenAddress, data: transfer(55n) }
      ])
    },
    empty: { data: '0xdeadbeef' },
    refund: {
      to: tokenAddress,
      data: transfer(100n),
      safeTxGas: '100000',
      baseGas: '21000',
      gasPrice: '1000000000',
      refundReceiver: recipient
    },
    tokenRefund: {
      to: tokenAddress,
      data: transfer(100n),
      safeTxGas: '100000',
      baseGas: '21000',
      gasPrice: '1',
      gasToken: tokenAddress,
      refundReceiver: recipient
    },
    innerFailure: {
      to: tokenAddress,
      data: transfer(2_000_000n),
      safeTxGas: '200000',
      baseGas: '21000',
      gasPrice: '1000000000',
      refundReceiver: recipient
    },
    rollback: { to: multiSend, operation: 1, data: rollback, safeTxGas: '500000' },
    fullRevert: { to: multiSend, operation: 1, data: rollback },
    queuedApproval: { to: tokenAddress, data: tokenAbi.encodeFunctionData('approve', [seed.safe, 1000n]) },
    futureAllowance: {
      nonce: '5',
      to: tokenAddress,
      data: tokenAbi.encodeFunctionData('transferFrom', [seed.safe, recipient, 1n])
    }
  }
  const safe = new Contract(seed.safe, safeAbi, provider)
  proposals = Object.fromEntries(
    await Promise.all(
      Object.entries(cases).map(async ([name, fields]) => {
        const proposal: SafeProposal = {
          safeTxHash: `0x${'0'.repeat(64)}`,
          safe: seed.safe,
          nonce: '0',
          to: recipient,
          value: '0',
          operation: 0,
          data: '0x',
          confirmations: [],
          safeTxGas: '0',
          baseGas: '0',
          gasPrice: '0',
          gasToken: ZeroAddress,
          refundReceiver: ZeroAddress,
          ...fields
        }
        proposal.safeTxHash = await safe.getTransactionHash(
          proposal.to,
          proposal.value,
          proposal.data,
          proposal.operation,
          proposal.safeTxGas,
          proposal.baseGas,
          proposal.gasPrice,
          proposal.gasToken,
          proposal.refundReceiver,
          proposal.nonce
        )
        return [name, proposal]
      })
    )
  )
  const handler = createSafeHandler({ ...seed, proposals: Object.values(proposals) })
  rpc = createSafeSimulationRpc({
    send(payload, callback) {
      requests.push(payload.method)
      if (payload.method === 'debug_traceCall' && traceMode === 'unavailable') {
        callback({ id: payload.id, jsonrpc: '2.0', error: { code: -32601, message: 'Tracing disabled' } })
        return
      }
      let params = payload.params
      if (payload.method === 'debug_traceCall' && traceMode === 'no-logs') {
        const copied = structuredClone(params) as [unknown, unknown, { tracerConfig?: { withLog?: boolean } }]
        copied[2].tracerConfig = { withLog: false }
        params = copied
      }
      void provider.send(payload.method, params).then(
        (result: unknown) => {
          if (payload.method === 'debug_traceCall') {
            traces.push(result as TraceCall)
          }
          callback({ id: payload.id, jsonrpc: '2.0', result })
        },
        (error: unknown) =>
          callback({
            id: payload.id,
            jsonrpc: '2.0',
            error: { code: -32000, message: error instanceof Error ? error.message : String(error) }
          })
      )
    }
  })
  const client = createSafeClient({
    call: (chain, address, data, blockTag, signal) => rpc.call(chain, address, data, blockTag, signal),
    request: (url, init) => handler(new Request(url, init)),
    networks: { [chainId]: 'http://safe-fixture.local/api' }
  })
  unsubscribe = base.store.subscribe((state) => selectors.setState(state, true))
  service = createSafeService({
    store,
    operations: createOperationService({ store, clock: { now: Date.now } }),
    accounts: {
      add(id, name) {
        store.getState().upsertAccount({
          id,
          address: id,
          name,
          lastSignerType: 'Address',
          signer: '',
          status: 'ok',
          requests: {},
          created: 'new:watch-only'
        })
      }
    },
    client,
    simulate: (input, signal) => simulateSafeProposal(input, { rpc, client, projection }, signal)
  })
  service.import(
    { type: 'account.create', source: 'safe', operationId: 'watch-simulation', address: seed.safe, chainId },
    { clientType: 'wallet-ui', windowInstanceId: 'safe-simulation' }
  )
  for (
    let attempt = 0;
    attempt < 100 && store.getState().operations['watch-simulation']?.operation.status === 'pending';
    attempt++
  ) {
    await Bun.sleep(10)
  }
  expect(store.getState().operations['watch-simulation']?.operation.status).toBe('succeeded')
}, 30_000)

afterAll(async () => {
  service?.dispose()
  rpc?.dispose()
  unsubscribe?.()
  provider?.destroy()
  if (anvil) {
    anvil.kill()
    await anvil.exited
  }
})

it('previews zero and partial confirmations in a profile containing only the watched Safe', async () => {
  expect(Object.keys(store.getState().main.accounts)).toEqual([seed.safe.toLowerCase()])
  expect(store.getState().main.accounts[seed.safe.toLowerCase()].signer).toBe('')
  expect(seed.owners.every((owner) => !store.getState().main.accounts[owner.toLowerCase()])).toBe(true)
  const native = await executed('native')
  expect(native.status).toBe('success')
  expect(native.effects).toContainEqual(
    expect.objectContaining({ kind: 'native', direction: 'out', amount: '0x2710' })
  )
  expect(native.assumptions?.join(' ')).toMatch(/guard/i)
  const erc20 = await executed('token')
  expect(erc20.status).toBe('success')
  expect(erc20.effects).toContainEqual(
    expect.objectContaining({
      kind: 'erc20',
      direction: 'out',
      amount: '0x3e8',
      assetAddress: tokenAddress.toLowerCase()
    })
  )
  const approval = await executed('approval')
  expect(approval.status).toBe('success')
  expect(approval.effects).toContainEqual(expect.objectContaining({ kind: 'allowance', amount: '0xc8' }))
})

it('executes MultiSend and undecoded configuration changes in Safe context without double-counting delegatecall value', async () => {
  const result = await executed('batch')
  expect(result.status).toBe('success')
  expect(result.effects?.filter((effect) => effect.kind === 'native')).toEqual([
    expect.objectContaining({ amount: '0x19', direction: 'out' })
  ])
  expect(result.effects).toContainEqual(
    expect.objectContaining({ kind: 'erc20', amount: '0xfa', direction: 'out' })
  )
  expect(result.effects).toContainEqual(expect.objectContaining({ kind: 'allowance', amount: '0x12c' }))
  expect((await preview('configuration')).status).toBe('success')
  expect(
    traces
      .flatMap(logs)
      .some(
        (event) =>
          event.address?.toLowerCase() === seed.safe.toLowerCase() &&
          event.topics?.[0] === id('AddedOwner(address)') &&
          (event.data?.toLowerCase().includes(newOwner.slice(2)) ??
            event.topics.some((topic) => topic.toLowerCase().endsWith(newOwner.slice(2))))
      )
  ).toBe(true)
  const configBatch = await executed('configurationBatch')
  expect(configBatch.status).toBe('success')
  expect(configBatch.effects).toContainEqual(expect.objectContaining({ kind: 'erc20', amount: '0x37' }))
  expect((await preview('empty')).status).toBe('success')
})

it('uses the future proposal nonce against current state without replaying a queued approval', async () => {
  const future = await executed('future')
  expect(future.status).toBe('success')
  expect(future.currentNonce).toBe('0')
  expect(future.effects).toContainEqual(expect.objectContaining({ kind: 'native', amount: '0xc' }))
  expect(
    traces
      .flatMap(logs)
      .some(
        (event) =>
          event.address?.toLowerCase() === seed.safe.toLowerCase() &&
          event.topics?.[0] === id('ExecutionSuccess(bytes32,uint256)') &&
          (event.topics.includes(proposals.future.safeTxHash) ||
            event.data?.startsWith(proposals.future.safeTxHash))
      )
  ).toBe(true)
  expect((await preview('futureAllowance')).status).toBe('error')
})

it('preserves refunds, distinguishes inner failure from full revert, and discards rolled-back batch effects', async () => {
  const refund = await executed('refund')
  expect(refund.status).toBe('success')
  expect(
    refund.effects?.some((effect) => effect.kind === 'native' && BigInt(effect.amount ?? '0') > 0n)
  ).toBe(true)
  const tokenRefund = await executed('tokenRefund')
  expect(tokenRefund.status).toBe('success')
  expect(tokenRefund.effects?.filter((effect) => effect.kind === 'erc20')).toHaveLength(1)
  expect(
    BigInt(tokenRefund.effects?.find((effect) => effect.kind === 'erc20')?.amount ?? '0')
  ).toBeGreaterThan(100n)
  const failed = await executed('innerFailure')
  expect(failed).toMatchObject({ status: 'error', failure: 'inner' })
  expect(
    failed.effects?.some((effect) => effect.kind === 'native' && BigInt(effect.amount ?? '0') > 0n)
  ).toBe(true)
  expect(failed.effects?.some((effect) => effect.kind === 'erc20')).toBe(false)
  const rollback = await executed('rollback')
  expect(rollback).toMatchObject({ status: 'error', failure: 'inner' })
  expect(rollback.effects).toEqual([])
  const reverted = await preview('fullRevert')
  expect(reverted).toMatchObject({ status: 'error', failure: 'revert', effects: [] })
})

it('reports missing or disabled trace evidence as unavailable while preserving stored proposals', async () => {
  try {
    traceMode = 'unavailable'
    expect((await preview('native')).status).toBe('unavailable')
    traceMode = 'no-logs'
    expect((await preview('token')).status).toBe('unavailable')
  } finally {
    traceMode = 'normal'
  }
})
