import { createAccountsCapability } from '../../../features/accounts/renderer/accountsCapability.ts'
import { createQrCameraCapability } from '../../../platform/desktop/renderer/camera.ts'
import link from '../../../platform/ipc/renderer/link.ts'

export const accountsCapability = createAccountsCapability(link)
export const qrCameraCapability = createQrCameraCapability()
