import { describe, expect, it, mock } from 'bun:test'

import { Interface } from 'ethers'

import createCanonicalStore from '../../../core/state/store/createCanonicalStore.ts'
import type { Callback } from '../../../shared/domain/async.ts'
import type {
  EVMError,
  RPCRequestCallback,
  RPCRequestPayload,
  RPCResponsePayload
} from '../../../shared/domain/rpc.ts'
import { TxClassification, type TransactionRequest } from '../../requests/contract/requests.ts'
import { GasFeesSource, type TransactionEffect } from '../domain/index.ts'
import {
  createTransactionSimulationProjection,
  effectsFromLogs,
  simulateTransactionEffects,
  type SimulatedCall,
  type SimulationEffectContext,
  type TransactionSimulationProjection
} from './simulation.ts'

const account = '0x35f9179059A691D8BEECf82Fe112F7277E018588'
const testContract = '0x0000000000000000000000000000000000001337'
const usdc = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const other = '0x0000000000000000000000000000000000002222'
const nativeCurrency = { symbol: 'ETH', decimals: 18 }
const projection: TransactionSimulationProjection = {
  getNativeCurrency: () => nativeCurrency,
  getToken: () => undefined
}
const context: SimulationEffectContext = {
  account: account.toLowerCase(),
  data: { chainId: '0x7a69', to: usdc },
  tokenData: { decimals: 6, name: 'USD Coin', symbol: 'USDC' }
}
const events = new Interface([
  'event Transfer(address indexed from, address indexed to, uint256 value)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)'
])
function event(name: 'Transfer' | 'Approval', from: string, to: string, amount: bigint) {
  return { address: usdc, ...events.encodeEventLog(events.getEvent(name)!, [from, to, amount]) }
}
const nativeEmitter = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE'
function simulation(...calls: Array<Partial<SimulatedCall>>) {
  return [{ calls: calls.map((call) => ({ status: '0x1', returnData: '0x', logs: [], ...call })) }]
}
function effectMatching(effect: Partial<TransactionEffect>): TransactionEffect {
  return expect.objectContaining(effect) as TransactionEffect
}
function request(): TransactionRequest {
  return {
    ...context,
    requestId: 'request-1',
    type: 'transaction',
    origin: 'example.test',
    payload: { id: 1, jsonrpc: '2.0', method: 'eth_sendTransaction', params: [], _origin: 'example.test' },
    approvals: [],
    feesUpdatedByUser: false,
    recipientType: 'contract',
    recognizedActions: [],
    classification: TxClassification.CONTRACT_CALL,
    data: {
      chainId: '0x7a69',
      type: '0x2',
      gasFeesSource: GasFeesSource.Frame,
      from: account,
      to: usdc,
      gas: '0x10000',
      gasLimit: '0x20000',
      value: '0x0',
      data: '0x'
    }
  }
}
function provider(result: unknown, error?: EVMError) {
  return {
    send: mock((payload: RPCRequestPayload, callback?: RPCRequestCallback) => {
      callback?.({ id: payload.id, jsonrpc: '2.0', result, ...(error ? { error } : {}) })
    }),
    sendAsync: mock((_payload: RPCRequestPayload, callback: Callback<RPCResponsePayload>) => {
      callback(new Error('Metadata unavailable'))
    })
  }
}
function store() {
  return createCanonicalStore({ getItem: () => null, setItem: () => undefined, removeItem: () => undefined })
    .store
}

describe('#effectsFromLogs', () => {
  it('derives native and token deltas from emitted Transfer logs only', async () => {
    const effects = await effectsFromLogs(
      [
        event('Transfer', account, testContract, 95n),
        { ...event('Transfer', account, testContract, 7n), address: nativeEmitter },
        { ...event('Transfer', testContract, account, 2n), address: nativeEmitter }
      ],
      context,
      nativeCurrency,
      projection
    )
    expect(effects).toEqual([
      effectMatching({ kind: 'native', direction: 'out', amount: '0x5' }),
      effectMatching({ kind: 'erc20', direction: 'out', amount: '0x5f', decimals: 6, symbol: 'USDC' })
    ])
  })

  it('requires ERC20 event shape', async () => {
    const valid = event('Transfer', account, testContract, 5n)
    const effects = await effectsFromLogs(
      [
        { ...valid, topics: [...valid.topics, `0x${'0'.repeat(64)}`], data: '0x' },
        { ...valid, data: '0x05' },
        { ...valid, topics: [valid.topics[0], `0x1${valid.topics[1].slice(3)}`, valid.topics[2]] },
        valid
      ],
      context,
      nativeCurrency,
      projection
    )
    expect(effects).toEqual([effectMatching({ assetAddress: usdc.toLowerCase(), amount: '0x5' })])
  })

  it('preserves zero and repeated owner-relative Approval events, without claiming final allowance', async () => {
    const approval = event('Approval', account, testContract, 25n)
    const effects = await effectsFromLogs(
      [
        event('Approval', other, account, 90n),
        approval,
        event('Approval', account, testContract, 0n),
        approval
      ],
      context,
      nativeCurrency,
      projection
    )
    expect(
      effects.map(({ kind, amount, spenderAddress, label }) => ({ kind, amount, spenderAddress, label }))
    ).toEqual([
      { kind: 'allowance', amount: '0x19', spenderAddress: testContract, label: 'Observed approval' },
      { kind: 'allowance', amount: '0x0', spenderAddress: testContract, label: 'Observed approval' },
      { kind: 'allowance', amount: '0x19', spenderAddress: testContract, label: 'Observed approval' }
    ])
    expect(new Set(effects.map((effect) => effect.id)).size).toBe(3)
  })

  it('uses canonical metadata and persisted token images before request metadata', async () => {
    const canonical = store()
    canonical.setState((state) => {
      state.main.tokens.byId[`31337:${usdc.toLowerCase()}`] = {
        address: usdc.toLowerCase(),
        chainId: 31337,
        decimals: 6,
        name: 'Cached USD Coin',
        symbol: 'USDC',
        image: { base64: 'dG9rZW4taWNvbg==', contentHash: 'token-icon', mimeType: 'image/png' },
        custom: false,
        curated: false,
        sources: ['transaction'],
        updatedAt: 0
      }
    })
    const effects = await effectsFromLogs(
      [event('Transfer', account, testContract, 25_000_000n)],
      { ...context, tokenData: { name: 'Wrong', symbol: 'WRONG', decimals: 18 } },
      nativeCurrency,
      createTransactionSimulationProjection(canonical)
    )
    expect(effects).toEqual([
      effectMatching({
        amount: '0x17d7840',
        decimals: 6,
        symbol: 'USDC',
        logoURI: 'data:image/png;base64,dG9rZW4taWNvbg=='
      })
    ])
  })

  it('uses recognized and internal-send metadata, leaving unavailable decimals unknown', async () => {
    const transfer = [event('Transfer', account, testContract, 133_000_000n)]
    const recognized: SimulationEffectContext = {
      ...context,
      tokenData: undefined,
      recognizedActions: [
        { id: 'erc20:transfer', data: { contract: usdc, decimals: 6, name: 'USD Coin', symbol: 'USDC' } }
      ]
    }
    for (const metadataContext of [context, recognized]) {
      expect(await effectsFromLogs(transfer, metadataContext, nativeCurrency, projection)).toEqual([
        effectMatching({ amount: '0x7ed6b40', decimals: 6, symbol: 'USDC' })
      ])
    }
    const [unknown] = await effectsFromLogs(
      transfer,
      { ...context, tokenData: undefined },
      nativeCurrency,
      projection
    )
    expect(unknown.symbol).toBe('Token')
    expect(unknown).not.toHaveProperty('decimals')
  })
})

describe('#simulateTransactionEffects', () => {
  it('sends an internal eth_simulateV1 envelope and computes canonical profile-relative effects', async () => {
    const canonical = store()
    const profileId = canonical.getState().main.currentProfile
    canonical.getState().upsertAccount({ id: account.toLowerCase(), address: account })
    canonical.getState().upsertAccount({ id: testContract, address: testContract })
    canonical.getState().createProfile('other', 'Other')
    canonical.getState().upsertAccount({ id: other, address: other, profileId: 'other' })
    const rpc = provider(simulation({ logs: [event('Transfer', account, testContract, 25n)] }))
    const result = await simulateTransactionEffects(
      request(),
      rpc,
      createTransactionSimulationProjection(canonical)
    )
    expect(rpc.send.mock.calls[0][0]).toMatchObject({
      jsonrpc: '2.0',
      method: 'eth_simulateV1',
      chainId: '0x7a69',
      _origin: 'newframe-internal',
      params: [
        {
          blockStateCalls: [
            { calls: [{ from: account, to: usdc, gas: '0x20000', value: '0x0', data: '0x' }] }
          ],
          traceTransfers: true
        },
        'latest'
      ]
    })
    expect(result.status).toBe('success')
    expect(result.effectsProfileId).toBe(profileId)
    expect(result.effectsByAccount).toEqual({
      [account.toLowerCase()]: [
        expect.objectContaining({ direction: 'out', amount: '0x19', symbol: 'USDC' })
      ],
      [testContract]: [expect.objectContaining({ direction: 'in', amount: '0x19', symbol: 'USDC' })]
    })
    expect(rpc.sendAsync).not.toHaveBeenCalled()
  })

  it('marks malformed simulations unavailable while keeping RPC and simulated failures distinct', async () => {
    for (const invalid of [
      undefined,
      null,
      {},
      [],
      [{ calls: [] }],
      simulation({ status: '0x2' as '0x1' }),
      simulation({ logs: [{ address: usdc, topics: [], data: '0x0' }] })
    ]) {
      expect(await simulateTransactionEffects(request(), provider(invalid), projection)).toMatchObject({
        status: 'unavailable',
        error: 'RPC returned an invalid simulation'
      })
    }
    expect(
      await simulateTransactionEffects(
        request(),
        provider(undefined, { message: 'Method not supported' }),
        projection
      )
    ).toMatchObject({ status: 'unavailable', error: 'Method not supported' })
    expect(
      await simulateTransactionEffects(
        request(),
        provider(simulation({ status: '0x0', error: { message: 'execution reverted' } })),
        projection
      )
    ).toMatchObject({ status: 'error', error: 'execution reverted' })
    expect(await simulateTransactionEffects(request(), provider(simulation({})), projection)).toMatchObject({
      status: 'success',
      effects: []
    })
  })
})
