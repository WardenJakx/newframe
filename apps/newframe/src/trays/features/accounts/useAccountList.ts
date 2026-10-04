import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { createBalanceSummarySelector } from '../../../features/asset-data/domain/balance/index.ts'
import { useWalletSelector } from '../../shared/projection/useAppSelector.tsx'
import { buildAccountListModel } from './accountsModel.ts'

export function useAccountList() {
  const projection = useWalletSelector(
    useShallow((state) => ({
      accountOrder: state.accountOrder,
      accounts: state.accounts,
      assetRates: state.assetRates,
      balances: state.balances,
      currentAccount: state.currentAccount,
      currentProfile: state.currentProfile,
      chains: state.chains.ethereum,
      chainsMeta: state.chainsMeta.ethereum,
      operations: state.operations,
      profiles: state.profiles,
      showLocalNameWithENS: Boolean(state.showLocalNameWithENS),
      showTestnets: Boolean(state.showTestnets),
      signers: state.signers,
      tokens: state.tokens
    }))
  )
  const [selectBalanceSummaries] = useState(() => createBalanceSummarySelector())
  const model = buildAccountListModel({
    accountOrder: projection.accountOrder,
    accounts: projection.accounts,
    assetRates: projection.assetRates,
    balances: projection.balances,
    currentAccountId: projection.currentAccount,
    chains: projection.chains,
    chainsMeta: projection.chainsMeta,
    profiles: projection.profiles,
    query: '',
    selectBalanceSummaries,
    showLocalNameWithENS: projection.showLocalNameWithENS,
    showTestnets: projection.showTestnets,
    signers: projection.signers,
    tokens: projection.tokens
  })
  return { projection, model }
}
