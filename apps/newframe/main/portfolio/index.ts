import ZerionPortfolioProvider from './providers/zerion'

import type { PortfolioProvider } from './types'

interface PortfolioProviderOptions {
  apiKey: string
  fetch?: typeof fetch
}

// Keep provider-specific concerns behind this factory. Main and store code should
// pass generic portfolio inputs and avoid depending on Zerion or any future
// provider's chain IDs, cache shape, request details, or response quirks.
export function createPortfolioProvider(options: PortfolioProviderOptions): PortfolioProvider {
  return new ZerionPortfolioProvider(options)
}

export type { PortfolioProvider } from './types'
