import { createAccountsCapability } from '../../features/accounts/accountsCapability.ts'
import { createQrCameraCapability } from '../../shared/camera/camera.ts'
import link from '../../shared/host/link.ts'

export const accountsCapability = createAccountsCapability(link)
export const qrCameraCapability = createQrCameraCapability()
