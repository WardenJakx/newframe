import ZerionPortfolioProvider from './providers/zerion.js'
import type { CanonicalStoreReader } from '../../../platform/state-store/actions.js'

import type { PortfolioProvider } from './types.js'

type TokenDiscoveryProviderError = 'token_discovery_disabled' | 'missing_api_key'

export type TokenDiscoveryProviderAccess =
  | { ok: true; provider: PortfolioProvider }
  | { ok: false; error: TokenDiscoveryProviderError }

// Keep provider construction and preference checks behind this boundary so a
// caller cannot accidentally use token discovery when the user disabled it.
export function getTokenDiscoveryProvider(
  canonicalStore: Pick<CanonicalStoreReader, 'getState'>
): TokenDiscoveryProviderAccess {
  if (canonicalStore.getState().main.autoDiscoverTokens !== true) {
    return { ok: false, error: 'token_discovery_disabled' }
  }

  const configuredApiKey = canonicalStore.getState().main.portfolioApiKey
  const apiKey = typeof configuredApiKey === 'string' ? configuredApiKey.trim() : ''

  if (!apiKey) return { ok: false, error: 'missing_api_key' }

  return { ok: true, provider: new ZerionPortfolioProvider({ apiKey }) }
}
