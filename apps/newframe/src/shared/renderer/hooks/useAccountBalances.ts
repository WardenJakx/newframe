import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { createBalanceSummarySelector } from '../../../features/asset-data/domain/balance'
import type { WalletRendererState } from '../../../platform/state-sync/contract/projections'
import { useWalletSelector } from '../../../platform/state-sync/renderer/useAppSelector'

const EMPTY_BALANCES: WalletRendererState['balances'][string] = []
const EMPTY_NETWORKS: WalletRendererState['networks']['ethereum'] = {}
const EMPTY_NETWORK_METADATA: WalletRendererState['networksMeta']['ethereum'] = {}
const EMPTY_RATES: WalletRendererState['assetRates'] = {}

export function useAccountBalances() {
  const shared = useWalletSelector(
    useShallow((state) => {
      const account = state.accounts?.[state.currentAccount]
      return {
        currentAccount: state.currentAccount || '',
        accountAddress: account?.address || '',
        networks: state.networks?.ethereum || EMPTY_NETWORKS,
        networksMeta: state.networksMeta?.ethereum || EMPTY_NETWORK_METADATA,
        assetRates: state.assetRates || EMPTY_RATES,
        tokens: state.tokens,
        rawBalances: account?.address ? state.balances?.[account.address] || EMPTY_BALANCES : EMPTY_BALANCES,
        showTestnets: !!state.showTestnets
      }
    })
  )
  const [selectBalanceSummaries] = useState(() => createBalanceSummarySelector())

  const balances = selectBalanceSummaries({
    rawBalances: shared.rawBalances,
    assetRates: shared.assetRates,
    tokens: shared.tokens,
    networks: shared.networks,
    networksMeta: shared.networksMeta,
    includeChain: (chain) => (!chain.isTestnet || shared.showTestnets) && !!chain.on,
    cacheKey: `${shared.accountAddress}:${shared.showTestnets ? 'testnets' : 'mainnets'}`
  })

  return { ...shared, balances }
}
