import log from 'electron-log'

import type { Accounts } from '../accounts/index.js'
import type { NameResolutionService } from '../nameResolution.js'
import type { Provider } from '../provider/index.js'
import { arraysEqual } from '../../domain/collections.js'
export function selectAccount(
  accountId: string,
  accounts: Pick<Accounts, 'getSelectedAddresses' | 'setSigner'>,
  provider: Pick<Provider, 'accountsChanged'>
) {
  const previousAddresses = accounts.getSelectedAddresses()

  return new Promise<Account>((resolve, reject) => {
    let result: { error: Error | null; account?: Account } | undefined

    try {
      accounts.setSigner(accountId, (error, account) => {
        result = { error, account }
      })

      const currentAddresses = accounts.getSelectedAddresses()
      if (!arraysEqual(previousAddresses, currentAddresses)) provider.accountsChanged(currentAddresses)

      const completed = result as { error: Error | null; account?: Account } | undefined
      if (!completed) return reject(new Error('Account selection did not complete'))
      if (completed.error) return reject(completed.error)
      if (!completed.account) return reject(new Error('Account selection returned no account'))

      resolve(completed.account)
    } catch (error) {
      reject(error)
    }
  })
}

export async function resolveName(name: string, nameResolution: NameResolutionService) {
  log.debug('Resolving name', { name })

  try {
    return await nameResolution.resolveAddress(name)
  } catch (error) {
    log.warn(`Could not resolve name ${name}:`, error)
    throw error
  }
}
