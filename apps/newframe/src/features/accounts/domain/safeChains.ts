// Hosted Transaction Service resolver from @safe-global/api-kit@5.0.3, synced 2026-09-09.
// Codex (81224) was added from the current upstream resolver after that release.
export const SAFE_SERVICE_CHAIN_SHORT_NAMES = Object.freeze({
  1: 'eth',
  10: 'oeth',
  50: 'xdc',
  56: 'bnb',
  100: 'gno',
  130: 'unichain',
  137: 'pol',
  143: 'monad',
  146: 'sonic',
  196: 'okb',
  204: 'opbnb',
  232: 'lens',
  324: 'zksync',
  480: 'wc',
  677: 'bot',
  988: 'stable',
  999: 'hyper',
  1001: 'kairos',
  1672: 'pharos',
  1874: 'wch-sepolia',
  3338: 'peaq',
  4217: 'tempo',
  4326: 'mega',
  4663: 'robinhood',
  5000: 'mantle',
  5003: 'mnt-sep',
  5042: 'arc',
  8217: 'kaia',
  8453: 'base',
  9745: 'plasma',
  10143: 'monad-testnet',
  10200: 'chi',
  16661: '0g',
  25363: 'fluent',
  42161: 'arb1',
  42220: 'celo',
  42431: 'tempo-moderato',
  43111: 'hemi',
  43114: 'avax',
  46630: 'robinhood-testnet',
  57073: 'ink',
  59144: 'linea',
  80069: 'bep',
  80094: 'berachain',
  81224: 'codex',
  84532: 'basesep',
  102030: 'ctc',
  534352: 'scr',
  747474: 'katana',
  5042002: 'arc-testnet',
  11142220: 'celo-sep',
  11155111: 'sep',
  1313161554: 'aurora'
} satisfies Readonly<Record<number, string>>)

// The Safe web app names some chains differently from the Transaction Service, per
// https://safe-config.safe.global/api/v1/chains/ on 2026-10-06. Null marks chains the app does not serve.
const SAFE_APP_CHAIN_PREFIX_OVERRIDES: Readonly<Record<number, string | null>> = Object.freeze({
  137: 'matic',
  196: 'xlayer',
  232: null,
  999: 'hyper-evm',
  4326: 'megaeth',
  5000: 'mnt',
  10200: 'chiado',
  80069: 'bepolia',
  81224: null
})

export function safeAppTransactionUrl(chainId: number, safe: string, safeTxHash: string): string | undefined {
  const prefix =
    chainId in SAFE_APP_CHAIN_PREFIX_OVERRIDES
      ? SAFE_APP_CHAIN_PREFIX_OVERRIDES[chainId]
      : (SAFE_SERVICE_CHAIN_SHORT_NAMES as Readonly<Record<number, string | undefined>>)[chainId]
  if (!prefix) {
    return undefined
  }
  const url = new URL('https://app.safe.global/transactions/tx')
  url.searchParams.set('safe', `${prefix}:${safe}`)
  url.searchParams.set('id', `multisig_${safe}_${safeTxHash}`)
  return url.href
}
