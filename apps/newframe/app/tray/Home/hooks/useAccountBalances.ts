import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { createBalanceSummarySelector } from '../../../../resources/domain/balance'
import { useWalletSelector } from '../../../state/useAppSelector'

const EMPTY_ARRAY: any[] = []
const EMPTY_RECORD: Record<string, any> = {}

export function useAccountBalances() {
  const shared = useWalletSelector(
    useShallow((state) => {
      const account = state.accounts?.[state.currentAccount]
      return {
        accountAddress: account?.address || '',
        networks: state.networks?.ethereum || EMPTY_RECORD,
        networksMeta: state.networksMeta?.ethereum || EMPTY_RECORD,
        rates: state.rates || EMPTY_RECORD,
        tokens: state.tokens,
        rawBalances: account?.address ? state.balances?.[account.address] || EMPTY_ARRAY : EMPTY_ARRAY,
        showTestnets: !!state.showTestnets
      }
    })
  )
  const [selectBalanceSummaries] = useState(() => createBalanceSummarySelector())

  const balances = selectBalanceSummaries({
    rawBalances: shared.rawBalances,
    rates: shared.rates,
    tokens: shared.tokens,
    networks: shared.networks,
    networksMeta: shared.networksMeta,
    includeChain: (chain) => (!chain.isTestnet || shared.showTestnets) && !!chain.on,
    cacheKey: `${shared.accountAddress}:${shared.showTestnets ? 'testnets' : 'mainnets'}`
  })

  return { ...shared, balances }
}
