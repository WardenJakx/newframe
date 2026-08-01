export async function rpcMatchesChain(url: unknown, chainId: number) {
  if (typeof url !== 'string') return false

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 1, jsonrpc: '2.0', method: 'eth_chainId', params: [] }),
      signal: AbortSignal.timeout(10_000)
    })
    if (!response.ok) return false

    const payload = (await response.json()) as { result?: unknown }
    return (
      typeof payload.result === 'string' &&
      /^0x[0-9a-f]+$/i.test(payload.result) &&
      Number(BigInt(payload.result)) === chainId
    )
  } catch {
    return false
  }
}
