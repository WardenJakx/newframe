import type { Balance, Token } from '../../../platform/state-store/state/index.ts'
import type { Address } from '../../../shared/domain/address.ts'
import type { AssetRateInput, AssetRateSource } from '../../asset-data/domain/state/rate.ts'

export interface PortfolioRefreshOptions {
  sync?: boolean
}

export interface PortfolioSnapshot {
  tokens: Token[]
  balances: Balance[]
  assetRates: AssetRateInput[]
}

export interface PortfolioChainImage {
  url: string
}

export interface PortfolioProvider {
  readonly rateSource: AssetRateSource
  getWalletPortfolio: (
    address: Address,
    chainIds: number[],
    options?: PortfolioRefreshOptions
  ) => Promise<PortfolioSnapshot>
  getChainImage: (chainId: number) => Promise<PortfolioChainImage | undefined>
}
