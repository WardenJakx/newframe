import type { createFlashApi } from '@newframe/flash/api'
import { getFlashChainSlug } from '@newframe/flash/chains'
import type { FlashTokenBalance } from '@newframe/flash/wire'

import type { AssetRateInput } from '../../../../../features/asset-data/domain/state/rate.ts'
import { NATIVE_CURRENCY } from '../../../../../features/tokens/domain/constants.ts'
import type { Balance, Token } from '../../../../../platform/state-store/state/index.ts'
import type { Address } from '../../../../../shared/domain/address.ts'
import { formatUnits, parseUnits } from '../../../../../shared/domain/units.ts'
import type { PortfolioChainImage, PortfolioProvider, PortfolioSnapshot } from '../types.ts'

type FlashBalancesApi = Pick<ReturnType<typeof createFlashApi>, 'balances'>

interface FlashProviderOptions {
  api: FlashBalancesApi
}

function isEvmAddress(address: string) {
  return /^0x[a-f0-9]{40}$/.test(address)
}

function rowAddress(row: FlashTokenBalance) {
  if (row.isNative) {
    return NATIVE_CURRENCY
  }

  const address = row.address.toLowerCase()
  return isEvmAddress(address) && address !== NATIVE_CURRENCY ? address : undefined
}

function rowRate(row: FlashTokenBalance, chainId: number, address: string): AssetRateInput | undefined {
  const balance = Number(row.balance)
  const usdRate = Number(row.notional) / balance
  if (!Number.isFinite(usdRate) || usdRate <= 0) {
    return undefined
  }

  // Flash reports 24h change as a fraction; asset rates store it as a percentage.
  const change24hr = row.priceChange24h === null ? NaN : Number(row.priceChange24h) * 100

  return {
    chainId,
    address,
    usdRate,
    ...(Number.isFinite(change24hr) ? { change24hr } : {})
  }
}

export default class FlashPortfolioProvider implements PortfolioProvider {
  readonly rateSource = 'flash'
  private readonly api: FlashBalancesApi

  constructor({ api }: FlashProviderOptions) {
    this.api = api
  }

  async getWalletPortfolio(address: Address, chainIds: number[]): Promise<PortfolioSnapshot> {
    const chainIdsBySlug = new Map(chainIds.map((chainId) => [getFlashChainSlug(chainId), chainId]))
    chainIdsBySlug.delete('')

    const snapshot: PortfolioSnapshot = {
      tokens: [],
      balances: [],
      assetRates: []
    }
    if (chainIdsBySlug.size === 0) {
      return snapshot
    }

    const { balances } = await this.api.balances(address)

    balances.forEach((row) => {
      const chainId = chainIdsBySlug.get(row.chain)
      const address = rowAddress(row)
      const quantity = parseUnits(row.balance, row.tokenDecimals)
      if (!chainId || !address || quantity === undefined || quantity <= 0n) {
        return
      }

      const balance: Balance = {
        address,
        chainId,
        balance: `0x${quantity.toString(16)}`,
        displayBalance: formatUnits(quantity, row.tokenDecimals)
      }
      snapshot.balances.push(balance)

      if (address !== NATIVE_CURRENCY && row.tokenDecimals > 0) {
        const token: Token = {
          address,
          chainId,
          name: row.symbol || address,
          symbol: row.symbol || address,
          decimals: row.tokenDecimals,
          logoURI: row.imageUrl
        }
        snapshot.tokens.push(token)
      }

      const rate = rowRate(row, chainId, address)
      if (rate) {
        snapshot.assetRates.push(rate)
      }
    })

    return snapshot
  }

  async getChainImage(): Promise<PortfolioChainImage | undefined> {
    return undefined
  }
}
