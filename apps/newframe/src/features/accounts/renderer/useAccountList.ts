import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { useWalletSelector } from '../../../platform/state-sync/renderer/useAppSelector'
import { createBalanceSummarySelector } from '../../asset-data/domain/balance'
import { buildAccountListModel } from './accountsModel'

export function useAccountList() {
  const projection = useWalletSelector(
    useShallow((state) => ({
      accountOrder: state.accountOrder,
      accounts: state.accounts,
      assetRates: state.assetRates,
      balances: state.balances,
      currentAccount: state.currentAccount,
      currentProfile: state.currentProfile,
      networks: state.networks.ethereum,
      networksMeta: state.networksMeta.ethereum,
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
    networks: projection.networks,
    networksMeta: projection.networksMeta,
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
