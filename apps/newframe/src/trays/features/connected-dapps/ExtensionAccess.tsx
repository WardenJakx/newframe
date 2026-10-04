import { useShallow } from 'zustand/react/shallow'

import { accountDisplayType } from '../../../features/accounts/domain/accountDisplayType.ts'
import { useWalletSelector } from '../../shared/projection/useAppSelector.tsx'
import type { ConnectionsCapability } from './connectionsCapability.ts'
import { ExtensionAccessView } from './ExtensionAccessView.tsx'

export default function ExtensionAccessNotification({
  id,
  capability
}: {
  id: string
  capability: Pick<ConnectionsCapability, 'respondToExtensionAccess'>
}) {
  const { accountOrder, accounts, access, currentAccount } = useWalletSelector(
    useShallow((state) => ({
      accountOrder: state.accountOrder,
      accounts: state.accounts,
      access: Object.hasOwn(state.extensionAccess, id) ? state.extensionAccess[id] : undefined,
      currentAccount: state.currentAccount
    }))
  )
  const profileAccounts = accountOrder.flatMap((accountId) => {
    const account = Object.hasOwn(accounts, accountId) ? accounts[accountId] : undefined
    return account
      ? [
          {
            id: account.id,
            address: account.address,
            name: account.name,
            accountType: accountDisplayType(account)
          }
        ]
      : []
  })
  // A first grant starts from the account the human is using.
  const initial = access
    ? { all: access.all, accountIds: access.accounts }
    : { all: false, accountIds: currentAccount ? [currentAccount] : [] }

  return (
    <ExtensionAccessView
      accounts={profileAccounts}
      initial={initial}
      onCancel={() => void capability.respondToExtensionAccess({ extensionId: id })}
      onSave={(grant) => void capability.respondToExtensionAccess({ extensionId: id, grant })}
    />
  )
}
