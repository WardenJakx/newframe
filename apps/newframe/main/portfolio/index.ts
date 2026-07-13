import ZerionPortfolioProvider from './providers/zerion'
import store from '../store'

import type { PortfolioProvider } from './types'

export type TokenDiscoveryProviderError = 'token_discovery_disabled' | 'missing_api_key'

export type TokenDiscoveryProviderAccess =
  | { ok: true; provider: PortfolioProvider }
  | { ok: false; error: TokenDiscoveryProviderError }

// Keep provider construction and preference checks behind this boundary so a
// caller cannot accidentally use token discovery when the user disabled it.
export function getTokenDiscoveryProvider(): TokenDiscoveryProviderAccess {
  if (store('main.autoDiscoverTokens') !== true) {
    return { ok: false, error: 'token_discovery_disabled' }
  }

  const configuredApiKey = store('main.portfolioApiKey')
  const apiKey = typeof configuredApiKey === 'string' ? configuredApiKey.trim() : ''

  if (!apiKey) return { ok: false, error: 'missing_api_key' }

  return { ok: true, provider: new ZerionPortfolioProvider({ apiKey }) }
}

export type { PortfolioProvider } from './types'
