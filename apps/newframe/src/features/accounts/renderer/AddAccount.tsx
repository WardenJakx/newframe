import type { QrCameraCapability } from '../../../platform/desktop/renderer/camera'
import type { AccountsCapability } from './accountsCapability'
import { AddAccountController } from './AddAccountController'

export interface AddAccountProps {
  capability: AccountsCapability
  camera: QrCameraCapability
  onClose: () => void
}

export function AddAccount(props: AddAccountProps) {
  return <AddAccountController {...props} />
}
