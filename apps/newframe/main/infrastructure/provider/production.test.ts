import { describe, expect, it, mock } from 'bun:test'

import { createRendererPrincipal } from '../../authority'
import { createProviderRequestAdapter } from './production'

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
    const first = adapter.request(
      { id: 1, jsonrpc: '2.0', method: 'eth_chainId', params: [], _origin: 'test-origin' },
      principal
    )
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
})
