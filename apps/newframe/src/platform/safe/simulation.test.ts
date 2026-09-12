import { expect, it } from 'bun:test'
import { createSafeSimulationRpc } from './simulation'

it('routes reads to the selected chain and rejects write methods', async () => {
  const sent: unknown[] = []
  const rpc = createSafeSimulationRpc({
    send(payload, callback, target) {
      sent.push({ payload, target })
      callback({ id: payload.id, jsonrpc: '2.0', result: '0x12' })
    }
  })
  expect(await rpc.call(100, '0x1111111111111111111111111111111111111111', '0xab', '0x123')).toBe('0x12')
  expect(sent[0]).toMatchObject({
    target: { type: 'ethereum', id: 100 },
    payload: { method: 'eth_call', params: [{ data: '0xab' }, '0x123'] }
  })
  await expect(rpc.request(100, 'eth_sendTransaction' as never, [])).rejects.toThrow(
    'Invalid Safe simulation read'
  )
  expect(sent).toHaveLength(1)
  rpc.dispose()
})

it('settles reads when the RPC times out or the caller aborts', async () => {
  for (const reason of ['timeout', 'abort']) {
    const rpc = createSafeSimulationRpc({ send: () => undefined }, { timeoutMs: 5 })
    const controller = new AbortController()
    const pending = rpc.request(1, 'eth_chainId', [], controller.signal)
    if (reason === 'abort') controller.abort(new Error('Cancelled'))
    await expect(pending).rejects.toThrow(reason === 'timeout' ? 'timed out' : 'Cancelled')
    rpc.dispose()
  }
})

it('pins metadata calls and rejects write methods through the metadata compatibility port', async () => {
  const methods: unknown[] = []
  const rpc = createSafeSimulationRpc({
    send(payload, done, target) {
      methods.push({ payload, target })
      done({ id: payload.id, jsonrpc: '2.0', result: '0x' })
    }
  })
  const metadata = rpc.metadataProvider!(10, '0x77')
  const request = (method: string) =>
    new Promise((resolve, reject) =>
      metadata.sendAsync(
        {
          id: 1,
          jsonrpc: '2.0',
          method,
          params: [{ to: '0x1111111111111111111111111111111111111111', data: '0x' }, 'latest'],
          chainId: '0xa',
          _origin: 'newframe-internal'
        },
        (error, response) => (error ? reject(error) : resolve(response))
      )
    )
  await request('eth_call')
  expect(methods[0]).toMatchObject({ payload: { params: [{ data: '0x' }, '0x77'] }, target: { id: 10 } })
  await expect(request('eth_sendTransaction')).rejects.toThrow('Unsupported token metadata read')
  rpc.dispose()
})
