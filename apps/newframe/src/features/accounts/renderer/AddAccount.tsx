import type { AccountsCapability } from './accountsCapability'
import { AddAccountController } from './AddAccountController'

export interface AddAccountProps {
  capability: AccountsCapability
  initialSelectedSigner?: string
  initialType?: string
  onClose: () => void
}

export function AddAccount(props: AddAccountProps) {
  return <AddAccountController {...props} />
}
