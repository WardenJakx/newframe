import { describe, expect, it, mock } from 'bun:test'

import { Interface } from 'ethers'

import createCanonicalStore from '../../../platform/state-store/createCanonicalStore'
import { erc20Interface } from '../../../shared/domain/evm'
import { TxClassification, type TransactionRequest } from '../../requests/contract/requests'
import { GasFeesSource } from '../domain'
import {
  createTransactionSimulationProjection,
  effectsFromTrace,
  simulateTransactionEffects,
  type SimulationEffectContext,
  type TraceCall,
  type TransactionSimulationProjection
} from './simulation'

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
function trace(overrides: Partial<TraceCall> = {}): TraceCall {
  return { type: 'CALL', from: account, to: testContract, value: '0x0', input: '0x', ...overrides }
}
function request(): TransactionRequest {
  return {
    ...context,
    handlerId: 'request-1',
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

describe('#effectsFromTrace', () => {
  it('uses emitted token amounts, without inventing transfers from transfer/transferFrom calldata or false returns', async () => {
    const effects = await effectsFromTrace(
      trace({
        calls: [
          trace({
            to: usdc,
            input: erc20Interface.encodeFunctionData('transfer', [testContract, 90]),
            output: `0x${'0'.repeat(64)}`
          }),
          trace({
            from: testContract,
            to: usdc,
            input: erc20Interface.encodeFunctionData('transferFrom', [account, testContract, 80])
          }),
          trace({
            to: usdc,
            input: erc20Interface.encodeFunctionData('transfer', [testContract, 100]),
            logs: [event('Transfer', account, testContract, 95n)]
          })
        ]
      }),
      context,
      nativeCurrency,
      projection
    )
    expect(effects).toEqual([
      expect.objectContaining({
        kind: 'erc20',
        direction: 'out',
        amount: '0x5f',
        decimals: 6,
        symbol: 'USDC'
      })
    ])
    expect(
      await effectsFromTrace(
        trace({ to: usdc, input: erc20Interface.encodeFunctionData('transfer', [testContract, 100]) }),
        context,
        nativeCurrency,
        projection
      )
    ).toEqual([])
  })

  it('prunes every reverted subtree while retaining committed sibling transfers and refunds', async () => {
    const rolledBack = trace({
      from: account,
      value: '0x64',
      error: 'execution reverted',
      logs: [event('Transfer', account, testContract, 100n)],
      calls: [trace({ logs: [event('Transfer', account, testContract, 200n)], value: '0x64' })]
    })
    const result = trace({
      output: `0x${'0'.repeat(64)}`,
      calls: [
        rolledBack,
        trace({ value: '0x7' }),
        trace({ logs: [event('Transfer', account, testContract, 9n)] })
      ]
    })
    expect(await effectsFromTrace(result, context, nativeCurrency, projection)).toEqual([
      expect.objectContaining({ kind: 'native', amount: '0x7' }),
      expect.objectContaining({ kind: 'erc20', amount: '0x9' })
    ])
    expect(
      await effectsFromTrace({ ...result, revertReason: 'Outer revert' }, context, nativeCurrency, projection)
    ).toEqual([])
  })

  it('counts CALL/CREATE/CREATE2/SELFDESTRUCT values, excluding inherited delegatecall/callcode/staticcall values', async () => {
    const effects = await effectsFromTrace(
      trace({
        value: '0x10',
        calls: [
          trace({ type: 'DELEGATECALL', value: '0x10', calls: [trace({ value: '0x2' })] }),
          trace({ type: 'CALLCODE', value: '0x10' }),
          trace({ type: 'STATICCALL', value: '0x10' }),
          trace({ type: 'CREATE', value: '0x3' }),
          trace({ type: 'CREATE2', value: '0x4' }),
          trace({ type: 'SELFDESTRUCT', from: testContract, to: account, value: '0x5' }),
          trace({ to: account, value: '0x10' })
        ]
      }),
      context,
      nativeCurrency,
      projection
    )
    expect(effects).toEqual([expect.objectContaining({ kind: 'native', direction: 'out', amount: '0x14' })])
  })

  it('requires ERC20 event shape, retaining a delegatecall event emitter rather than the implementation address', async () => {
    const valid = event('Transfer', account, testContract, 5n)
    const effects = await effectsFromTrace(
      trace({
        type: 'DELEGATECALL',
        to: other,
        logs: [
          { ...valid, topics: [...valid.topics, `0x${'0'.repeat(64)}`], data: '0x' },
          { ...valid, data: '0x05' },
          { ...valid, topics: [valid.topics[0], `0x1${valid.topics[1].slice(3)}`, valid.topics[2]] },
          valid
        ]
      }),
      context,
      nativeCurrency,
      projection
    )
    expect(effects).toEqual([expect.objectContaining({ assetAddress: usdc.toLowerCase(), amount: '0x5' })])
  })

  it('preserves zero and repeated owner-relative Approval events, without claiming final allowance', async () => {
    const approval = event('Approval', account, testContract, 25n)
    const effects = await effectsFromTrace(
      trace({
        logs: [
          event('Approval', other, account, 90n),
          approval,
          event('Approval', account, testContract, 0n),
          approval
        ],
        calls: [trace({ revertReason: 'Reverted approval', logs: [event('Approval', account, other, 60n)] })]
      }),
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
    const effects = await effectsFromTrace(
      trace({ logs: [event('Transfer', account, testContract, 25_000_000n)] }),
      { ...context, tokenData: { name: 'Wrong', symbol: 'WRONG', decimals: 18 } },
      nativeCurrency,
      createTransactionSimulationProjection(canonical)
    )
    expect(effects).toEqual([
      expect.objectContaining({
        amount: '0x17d7840',
        decimals: 6,
        symbol: 'USDC',
        logoURI: 'data:image/png;base64,dG9rZW4taWNvbg=='
      })
    ])
  })

  it('uses recognized and internal-send metadata, leaving unavailable decimals unknown', async () => {
    const transfer = trace({ logs: [event('Transfer', account, testContract, 133_000_000n)] })
    const recognized: SimulationEffectContext = {
      ...context,
      tokenData: undefined,
      recognizedActions: [
        { id: 'erc20:transfer', data: { contract: usdc, decimals: 6, name: 'USD Coin', symbol: 'USDC' } }
      ]
    }
    for (const metadataContext of [context, recognized]) {
      expect(await effectsFromTrace(transfer, metadataContext, nativeCurrency, projection)).toEqual([
        expect.objectContaining({ amount: '0x7ed6b40', decimals: 6, symbol: 'USDC' })
      ])
    }
    const [unknown] = await effectsFromTrace(
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
  it('sends the existing internal trace envelope and computes canonical profile-relative effects', async () => {
    const canonical = store()
    const profileId = canonical.getState().main.currentProfile
    canonical.getState().upsertAccount({ id: account.toLowerCase(), address: account })
    canonical.getState().upsertAccount({ id: testContract, address: testContract })
    canonical.getState().createProfile('other', 'Other')
    canonical.getState().upsertAccount({ id: other, address: other, profileId: 'other' })
    const rpc = provider(trace({ logs: [event('Transfer', account, testContract, 25n)] }))
    const result = await simulateTransactionEffects(
      request(),
      rpc,
      createTransactionSimulationProjection(canonical)
    )
    expect(rpc.send.mock.calls[0][0]).toMatchObject({
      jsonrpc: '2.0',
      method: 'debug_traceCall',
      chainId: '0x7a69',
      _origin: 'newframe-internal',
      params: [
        { from: account, to: usdc, gas: '0x20000', value: '0x0', data: '0x' },
        'latest',
        { tracer: 'callTracer', tracerConfig: { withLog: true } }
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

  it('marks malformed provider traces unavailable while keeping RPC and simulated failures distinct', async () => {
    for (const invalid of [
      undefined,
      null,
      {},
      [],
      { structLogs: [] },
      trace({ calls: [null as unknown as TraceCall] }),
      trace({ value: 'invalid' }),
      trace({ logs: [{ topics: [], data: '0x' }] })
    ]) {
      expect(await simulateTransactionEffects(request(), provider(invalid), projection)).toMatchObject({
        status: 'unavailable',
        error: 'RPC returned an invalid call trace'
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
        provider(trace({ error: 'execution reverted', calls: [trace({ value: '0x5' })] })),
        projection
      )
    ).toMatchObject({ status: 'error', error: 'execution reverted' })
    expect(await simulateTransactionEffects(request(), provider(trace()), projection)).toMatchObject({
      status: 'success',
      effects: []
    })
  })
})
