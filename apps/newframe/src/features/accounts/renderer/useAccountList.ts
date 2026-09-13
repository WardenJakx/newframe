import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { useWalletSelector } from '../../../platform/state-sync/renderer/useAppSelector'
import { createBalanceSummarySelector } from '../../asset-data/domain/balance'
import { buildAccountListModel } from './accountsModel'

const EMPTY_ARRAY: never[] = []
const EMPTY_RECORD = {}

export function useAccountList() {
  const projection = useWalletSelector(
    useShallow((state) => ({
      accountOrder: state.accountOrder || EMPTY_ARRAY,
      accounts: state.accounts || EMPTY_RECORD,
      assetRates: state.assetRates || EMPTY_RECORD,
      balances: state.balances || EMPTY_RECORD,
      currentAccount: state.currentAccount || '',
      currentProfile: state.currentProfile || '',
      networks: state.networks?.ethereum || EMPTY_RECORD,
      networksMeta: state.networksMeta?.ethereum || EMPTY_RECORD,
      operations: state.operations || EMPTY_RECORD,
      profiles: state.profiles || EMPTY_ARRAY,
      showLocalNameWithENS: Boolean(state.showLocalNameWithENS),
      showTestnets: Boolean(state.showTestnets),
      signers: state.signers || EMPTY_RECORD,
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
