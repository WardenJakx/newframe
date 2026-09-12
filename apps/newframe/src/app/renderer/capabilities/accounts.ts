import { createAccountsCapability } from '../../../features/accounts/renderer/accountsCapability'
import { createQrCameraCapability } from '../../../platform/desktop/renderer/camera'
import link from '../../../platform/ipc/renderer/link'

export const accountsCapability = createAccountsCapability(link)
export const qrCameraCapability = createQrCameraCapability()
