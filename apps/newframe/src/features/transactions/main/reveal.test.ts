import { expect, it } from 'bun:test'

import { createProviderProxyConnection } from '../../connections/main/provider/proxy'
import { createRevealService } from './reveal'

it('reveals a contract identity through its graph-owned provider proxy', async () => {
  const proxy = createProviderProxyConnection()
  const nameResolution = {
    reverseLookup: async () => 'vault.eth'
  }
  const reveal = createRevealService(proxy, nameResolution as never)

  proxy.on('provider:send', (payload: any) => {
    expect({
      chainId: payload.chainId,
      method: payload.method,
      params: payload.params
    }).toEqual({
      chainId: '0xa',
      method: 'eth_getCode',
      params: ['0x1111111111111111111111111111111111111111', 'latest']
    })
    proxy.emit('payload', { id: payload.id, jsonrpc: '2.0', result: '0x6000' })
  })

  proxy.start()
  await new Promise<void>((resolve) => proxy.once('connect', resolve))

  await expect(reveal.identity('0x1111111111111111111111111111111111111111', 10)).resolves.toEqual({
    ens: 'vault.eth',
    type: 'contract'
  })

  proxy.dispose()
})
