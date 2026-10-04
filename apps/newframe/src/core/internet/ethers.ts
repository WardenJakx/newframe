import type { FetchGetUrlFunc } from 'ethers'

import type { HttpFetch } from './index.ts'

/** Routes an ethers JSON-RPC provider's HTTP calls through the internet. */
export function ethersGetUrl(request: HttpFetch): FetchGetUrlFunc {
  return async (rpcRequest, cancel) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(new Error('request timeout')), rpcRequest.timeout)
    cancel?.addListener(() => controller.abort(new Error('request cancelled')))
    // Chromium refuses requests that set these; it computes the length and handles compression itself.
    const { 'content-length': _length, 'accept-encoding': _encoding, ...headers } = rpcRequest.headers
    try {
      const response = await request(rpcRequest.url, {
        method: rpcRequest.method,
        headers,
        body: rpcRequest.body ? Uint8Array.from(rpcRequest.body) : undefined,
        signal: controller.signal
      })
      return {
        statusCode: response.status,
        statusMessage: response.statusText,
        headers: Object.fromEntries(response.headers),
        body: response.body ? new Uint8Array(await response.arrayBuffer()) : null
      }
    } finally {
      clearTimeout(timer)
    }
  }
}
