import type { QrCameraCapability } from '../../../platform/desktop/renderer/camera.ts'
import type { AccountsCapability } from './accountsCapability.ts'
import { accountMatchesQuery } from './accountsModel.ts'
import { AccountsView } from './AccountsView.tsx'
import { AddAccount } from './AddAccount.tsx'
import { ProfileSelector } from './ProfileSelector.tsx'
import { useAccountList } from './useAccountList.ts'
import { useAccountsController } from './useAccountsController.ts'

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
