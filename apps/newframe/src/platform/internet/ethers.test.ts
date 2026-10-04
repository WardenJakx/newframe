import { expect, it, mock } from 'bun:test'

import { FetchRequest, JsonRpcProvider } from 'ethers'

import { ethersGetUrl } from './ethers.ts'

it('omits the headers Chromium refuses to send', async () => {
  const request = mock(
    async (_input: string | URL | Request, _init?: RequestInit) =>
      new Response(JSON.stringify({ id: 1, jsonrpc: '2.0', result: '0x1' }))
  )
  const rpc = new FetchRequest('https://rpc.example')
  rpc.getUrlFunc = ethersGetUrl(request)
  const provider = new JsonRpcProvider(rpc, 1, { staticNetwork: true, batchMaxCount: 1 })

  expect(await provider.send('eth_chainId', [])).toBe('0x1')
  const headers = new Headers(request.mock.calls[0]?.[1]?.headers)
  expect(headers.get('content-type')).toBe('application/json')
  expect(headers.has('content-length')).toBe(false)
  expect(headers.has('accept-encoding')).toBe(false)
  provider.destroy()
})
