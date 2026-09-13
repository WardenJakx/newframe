import type { QrCameraCapability } from '../../../platform/desktop/renderer/camera'
import type { AccountsCapability } from './accountsCapability'
import { accountMatchesQuery } from './accountsModel'
import { AccountsView } from './AccountsView'
import { AddAccount } from './AddAccount'
import { ProfileSelector } from './ProfileSelector'
import { useAccountList } from './useAccountList'
import { useAccountsController } from './useAccountsController'

export interface AccountsProps {
  capability: AccountsCapability
  camera: QrCameraCapability
  onClose: () => void
}

export function Accounts({ capability, camera, onClose }: AccountsProps) {
  const { projection, model } = useAccountList()
  const controller = useAccountsController({
    accounts: projection.accounts,
    capability,
    currentAccountId: projection.currentAccount,
    onClose,
    operations: projection.operations
  })

  return (
    <AccountsView
      {...controller.events}
      accountSearchInputRef={controller.accountSearchInputRef}
      addAccountView={
        <AddAccount capability={capability} camera={camera} onClose={controller.closeAddAccount} />
      }
      model={{
        ...model,
        items: model.items.filter((account) => accountMatchesQuery(account, controller.state.query))
      }}
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
