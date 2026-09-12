import { useState } from 'react'
import { useShallow } from 'zustand/react/shallow'

import type { QrCameraCapability } from '../../../platform/desktop/renderer/camera'
import { useWalletSelector } from '../../../platform/state-sync/renderer/useAppSelector'
import { createBalanceSummarySelector } from '../../asset-data/domain/balance'
import type { AccountsCapability } from './accountsCapability'
import { buildAccountListModel } from './accountsModel'
import { AccountsView } from './AccountsView'
import { AddAccount } from './AddAccount'
import { ProfileSelector } from './ProfileSelector'
import { useAccountsController } from './useAccountsController'

const EMPTY_ARRAY: never[] = []
const EMPTY_RECORD = {}

export interface AccountsProps {
  capability: AccountsCapability
  camera: QrCameraCapability
  initialNewAccountType?: string
  initialSelectedSigner?: string
  initialShowAddAccounts?: boolean
  onClose: () => void
}

export function Accounts({
  capability,
  camera,
  initialNewAccountType = '',
  initialSelectedSigner = '',
  initialShowAddAccounts = false,
  onClose
}: AccountsProps) {
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
  const controller = useAccountsController({
    accounts: projection.accounts,
    capability,
    currentAccountId: projection.currentAccount,
    initialShowAddAccounts,
    onClose,
    operations: projection.operations
  })
  const model = buildAccountListModel({
    accountOrder: projection.accountOrder,
    accounts: projection.accounts,
    assetRates: projection.assetRates,
    balances: projection.balances,
    currentAccountId: projection.currentAccount,
    networks: projection.networks,
    networksMeta: projection.networksMeta,
    profiles: projection.profiles,
    query: controller.state.query,
    selectBalanceSummaries,
    showLocalNameWithENS: projection.showLocalNameWithENS,
    showTestnets: projection.showTestnets,
    signers: projection.signers,
    tokens: projection.tokens
  })

  return (
    <AccountsView
      {...controller.events}
      accountSearchInputRef={controller.accountSearchInputRef}
      addAccountView={
        <AddAccount
          capability={capability}
          camera={camera}
          initialSelectedSigner={initialSelectedSigner}
          initialType={initialNewAccountType}
          onClose={controller.closeAddAccount}
        />
      }
      model={model}
      profileSelector={
        <ProfileSelector
          capability={capability}
          currentProfile={projection.currentProfile}
          profiles={projection.profiles}
        />
      }
      state={controller.state}
    />
  )
}
