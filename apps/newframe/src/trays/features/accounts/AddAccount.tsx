import type { QrCameraCapability } from '../../shared/camera/camera.ts'
import type { AccountsCapability } from './accountsCapability.ts'
import { AddAccountController } from './AddAccountController.tsx'

export interface AddAccountProps {
  capability: AccountsCapability
  camera: QrCameraCapability
  onClose: () => void
}

export function AddAccount(props: AddAccountProps) {
  return <AddAccountController {...props} />
}
