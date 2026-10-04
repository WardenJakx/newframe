import type { Token } from '../../../../../platform/state-store/state/index.ts'

export interface TokensByChain {
  [chainId: number]: Token[] | undefined
}

export function groupByChain(grouped: TokensByChain, token: Token) {
  return {
    ...grouped,
    [token.chainId]: [...(grouped[token.chainId] ?? []), token]
  }
}
