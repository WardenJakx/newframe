import link from '../../../platform/ipc/renderer/link'
import { createAccountsCapability } from '../../../features/accounts/renderer/accountsCapability'
import { createQrCameraCapability } from '../../../platform/desktop/renderer/camera'

export const accountsCapability = createAccountsCapability(link)
export const qrCameraCapability = createQrCameraCapability()
