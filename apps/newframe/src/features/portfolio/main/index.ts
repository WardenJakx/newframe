import { createFlashApi } from '@newframe/flash/api'

import { getMainRuntime } from '../../../platform/runtime/index.ts'
import type { CanonicalStoreReader } from '../../../platform/state-store/actions.ts'
import FlashPortfolioProvider from './providers/flash.ts'
import ZerionPortfolioProvider from './providers/zerion.ts'
import type { PortfolioProvider } from './types.ts'

type TokenDiscoveryProviderError = 'token_discovery_disabled' | 'missing_api_key'

export type TokenDiscoveryProviderAccess =
  | { ok: true; provider: PortfolioProvider }
  | { ok: false; error: TokenDiscoveryProviderError }

// Keep provider construction and preference checks behind this boundary so a
// caller cannot accidentally use token discovery when the user disabled it.
export function getTokenDiscoveryProvider(
  canonicalStore: Pick<CanonicalStoreReader, 'getState'>
): TokenDiscoveryProviderAccess {
  const { autoDiscoverTokens, portfolioApiKey, portfolioProvider } = canonicalStore.getState().main
  if (autoDiscoverTokens !== true) {
    return { ok: false, error: 'token_discovery_disabled' }
  }

  switch (portfolioProvider) {
    case 'flash':
      return {
        ok: true,
        provider: new FlashPortfolioProvider({
          api: createFlashApi({ runtime: getMainRuntime() })
        })
      }
    case 'zerion': {
      const apiKey = typeof portfolioApiKey === 'string' ? portfolioApiKey.trim() : ''
      if (!apiKey) {
        return { ok: false, error: 'missing_api_key' }
      }

      return { ok: true, provider: new ZerionPortfolioProvider({ apiKey }) }
    }
  }
}
