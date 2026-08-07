import { describe, expect, it, mock } from 'bun:test'

import { createRendererPrincipal } from '../../authority'
import { createProviderRequestAdapter, createRequestApprovalAdapter } from './production'

const principal = createRendererPrincipal({
  clientType: 'sidetray',
  entrypoint: 'sidetray',
  webContentsId: 1,
  windowInstanceId: 'provider-adapter-test'
})

describe('provider request infrastructure adapter', () => {
  it('settles a provider callback once and rejects pending work on shutdown', async () => {
    let respond: (response: RPCResponsePayload) => void = () => undefined
    const send = mock((_payload: unknown, callback: typeof respond) => {
      respond = callback
    })
    const adapter = createProviderRequestAdapter({ send } as never)
    const context = { tokenData: { decimals: 6, name: 'USD Coin', symbol: 'USDC' } }
    const first = adapter.request(
      { id: 1, jsonrpc: '2.0', method: 'eth_chainId', params: [], _origin: 'test-origin' },
      principal,
      context
    )
    expect(send).toHaveBeenCalledWith(expect.any(Object), expect.any(Function), principal, context)
    respond({ id: 1, jsonrpc: '2.0', result: '0x1' })
    respond({ id: 1, jsonrpc: '2.0', error: { code: -1, message: 'late' } })
    await expect(first).resolves.toMatchObject({ result: '0x1' })

    const pending = adapter.request(
      { id: 2, jsonrpc: '2.0', method: 'eth_chainId', params: [], _origin: 'test-origin' },
      principal
    )
    adapter.dispose()
    await expect(pending).rejects.toThrow('disposed before the operation completed')
  })

  it('makes the three callback-based approval methods promise-first and disposable', async () => {
    const pending: Callback<string>[] = []
    const approve = mock((_request: unknown, callback: Callback<string>) => pending.push(callback))
    const adapter = createRequestApprovalAdapter({
      approveSign: approve,
      approveSignTypedData: approve,
      approveTransactionRequest: approve
    } as never)
    const requests = [
      adapter.approveSign({} as never),
      adapter.approveSignTypedData({} as never),
      adapter.approveTransactionRequest({} as never)
    ]
    pending.forEach((complete, index) => complete(null, `result-${index}`))
    await expect(Promise.all(requests)).resolves.toEqual(['result-0', 'result-1', 'result-2'])

    const disposed = adapter.approveSign({} as never)
    adapter.dispose()
    await expect(disposed).rejects.toThrow('disposed before the operation completed')
  })
})
