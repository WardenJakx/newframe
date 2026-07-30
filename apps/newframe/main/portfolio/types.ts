import type { Balance, Token } from '../store/state/index.js'
import type { AssetRateInput } from '../../domain/state/rate.js'

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
  assetRates: AssetRateInput[]
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
