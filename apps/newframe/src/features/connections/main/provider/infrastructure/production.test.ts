import { describe, expect, it, mock } from 'bun:test'

import { createRendererPrincipal } from '../../../../access-control/main/authority'
import { GasFeesSource } from '../../../../transactions/domain'
import {
  createNamedAccountTransactionAdapter,
  createProviderRequestAdapter,
  createRequestApprovalAdapter
} from './production'

const principal = createRendererPrincipal({
  clientType: 'sidetray',
  entrypoint: 'sidetray',
  webContentsId: 1,
  windowInstanceId: 'provider-adapter-test'
})

it('forwards named-account prepare and execute without introducing account selection', async () => {
  const executor = '0x1111111111111111111111111111111111111111'
  const prepared = {
    transaction: {
      chainId: '0x1',
      type: '0x2',
      gasFeesSource: GasFeesSource.Frame,
      from: executor,
      to: '0x2222222222222222222222222222222222222222',
      value: '0x0',
      data: '0x',
      nonce: '0x1',
      gasLimit: '0x5208'
    },
    warnings: []
  }
  const prepareAccountTransaction = mock(async () => prepared)
  const executeAccountTransaction = mock(async () => 'outer-hash')
  const adapter = createNamedAccountTransactionAdapter({
    prepareAccountTransaction,
    executeAccountTransaction
  })
  expect(
    await adapter.prepare(executor, { chainId: '0x1', to: prepared.transaction.to, data: '0x', value: '0x0' })
  ).toBe(prepared)
  const context = {
    owner: { clientType: 'wallet-ui' as const, windowInstanceId: 'window' },
    isOwnerActive: () => true,
    subscribeOwnerDisposed: () => () => undefined
  }
  expect(await adapter.execute(executor, prepared.transaction, undefined, context, 'execute')).toBe(
    'outer-hash'
  )
  expect(prepareAccountTransaction).toHaveBeenCalledTimes(1)
  expect(executeAccountTransaction).toHaveBeenCalledTimes(1)
})

describe('provider request infrastructure adapter', () => {
  it('settles a provider callback once and rejects pending work on shutdown', async () => {
    let respond: (response: RPCResponsePayload) => void = () => undefined
    const send = mock((_payload: unknown, callback: typeof respond) => {
      respond = callback
    })
    const adapter = createProviderRequestAdapter({ send })
    const context = { tokenData: { decimals: 6, name: 'USD Coin', symbol: 'USDC' } }
    const first = adapter.request(
      { id: 1, jsonrpc: '2.0', method: 'eth_chainId', params: [], _origin: 'test-origin' },
      principal,
      context
    )
    expect(send).toHaveBeenCalledWith(expect.any(Object), expect.any(Function), principal, context)
    respond({ id: 1, jsonrpc: '2.0', result: '0x1' })
    respond({ id: 1, jsonrpc: '2.0', error: { code: -1, message: 'late' } })
    expect(first).resolves.toMatchObject({ result: '0x1' })

    const pending = adapter.request(
      { id: 2, jsonrpc: '2.0', method: 'eth_chainId', params: [], _origin: 'test-origin' },
      principal
    )
    adapter.dispose()
    expect(pending).rejects.toThrow('disposed before the operation completed')
  })

  it('makes the three callback-based approval methods promise-first and disposable', async () => {
    const pending: Callback<string>[] = []
    const approve = mock((_request: unknown, callback: Callback<string>) => pending.push(callback))
    const adapter = createRequestApprovalAdapter({
      approveSign: approve,
      approveSignTypedData: approve,
      approveTransactionRequest: approve
    })
    const requests = [
      adapter.approveSign({} as never),
      adapter.approveSignTypedData({} as never),
      adapter.approveTransactionRequest({} as never)
    ]
    pending.forEach((complete, index) => complete(null, `result-${index}`))
    expect(Promise.all(requests)).resolves.toEqual(['result-0', 'result-1', 'result-2'])

    const disposed = adapter.approveSign({} as never)
    adapter.dispose()
    expect(disposed).rejects.toThrow('disposed before the operation completed')
  })
})

it('rejects provider promise failures and ignores failures after callback settlement', async () => {
  let callbackFirst = false
  const adapter = createProviderRequestAdapter({
    send: async (payload: RPCRequestPayload, respond: (response: RPCResponsePayload) => void) => {
      if (callbackFirst) {
        respond({ id: payload.id, jsonrpc: '2.0', result: '0x1' })
      }
      throw new Error('provider unavailable')
    }
  })
  const payload: RPCRequestPayload = {
    id: 1,
    jsonrpc: '2.0',
    method: 'eth_chainId',
    params: [],
    _origin: 'test'
  }
  expect(adapter.request(payload, principal)).rejects.toThrow('provider unavailable')
  callbackFirst = true
  expect(adapter.request(payload, principal)).resolves.toMatchObject({ result: '0x1' })
  adapter.dispose()
})
