import link from '../../../platform/ipc/renderer/link'
import { createAccountsCapability } from '../../../features/accounts/renderer/accountsCapability'

export const accountsCapability = createAccountsCapability(link)
