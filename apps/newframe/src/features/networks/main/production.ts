const CHAINLIST_CATALOG_URL = 'https://chainlist.org/rpcs.json'
const CHAINLIST_ICON_BASE_URL = 'https://icons.llamao.fi/icons/chains/'
const CHAINLIST_TIMEOUT_MS = 3_000

type ChainlistEntry = {
  chainId?: unknown
  chainSlug?: unknown
  icon?: unknown
}

type ChainlistFetch = (url: string, init: RequestInit) => Promise<Pick<Response, 'json' | 'ok'>>

export function createChainlistIconLookup(fetchCatalog: ChainlistFetch = fetch) {
  let catalogRequest: Promise<ChainlistEntry[]> | undefined

  const loadCatalog = async () => {
    const response = await fetchCatalog(CHAINLIST_CATALOG_URL, {
      signal: AbortSignal.timeout(CHAINLIST_TIMEOUT_MS)
    })
    if (!response.ok) throw new Error('Chainlist catalog request failed')

    const catalog: unknown = await response.json()
    return Array.isArray(catalog) ? (catalog as ChainlistEntry[]) : []
  }

  return async (chainId: number) => {
    try {
      catalogRequest ||= loadCatalog()
      const chain = (await catalogRequest).find((entry) => entry.chainId === chainId)
      const chainSlug = typeof chain?.chainSlug === 'string' ? chain.chainSlug.trim() : ''
      const icon = typeof chain?.icon === 'string' ? chain.icon.trim() : ''
      const slug = chainSlug || icon
      return slug ? `${CHAINLIST_ICON_BASE_URL}rsz_${encodeURIComponent(slug)}.jpg` : ''
    } catch {
      catalogRequest = undefined
      return ''
    }
  }
}

export const lookupChainlistIcon = createChainlistIconLookup()

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
