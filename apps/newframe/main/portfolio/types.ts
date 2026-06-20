import type { Balance, Rate, Token } from '../store/state'

export interface PortfolioRefreshOptions {
  sync?: boolean
}

export interface PortfolioSnapshot {
  totalValue: number
  absoluteChange1d: number
  percentChange1d: number
  chainValues: Record<number, number>
  tokens: Token[]
  balances: Balance[]
  rates: Record<Address, { usd: Rate }>
  nativeRates: Record<number, Rate>
}

export interface PortfolioChainImage {
  url: string
}

export interface PortfolioProvider {
  getWalletPortfolio: (
    address: Address,
    chainIds: number[],
    options?: PortfolioRefreshOptions
  ) => Promise<PortfolioSnapshot>
  getChainImage: (chainId: number) => Promise<PortfolioChainImage | undefined>
}
