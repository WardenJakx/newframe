import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { createBalanceSummarySelector } from '../../../features/asset-data/domain/balance'
import type { WalletRendererState } from '../../../platform/state-sync/contract/projections'
import { useWalletSelector } from '../../../platform/state-sync/renderer/useAppSelector'

const EMPTY_BALANCES: WalletRendererState['balances'][string] = []

export function useAccountBalances() {
  const shared = useWalletSelector(
    useShallow((state) => {
      const accounts: Partial<typeof state.accounts> = state.accounts
      const account = accounts[state.currentAccount]
      return {
        currentAccount: state.currentAccount || '',
        accountAddress: account?.address ?? '',
        networks: state.networks.ethereum,
        networksMeta: state.networksMeta.ethereum,
        assetRates: state.assetRates,
        tokens: state.tokens,
        rawBalances: account?.address
          ? ((state.balances as Partial<typeof state.balances>)[account.address] ?? EMPTY_BALANCES)
          : EMPTY_BALANCES,
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
