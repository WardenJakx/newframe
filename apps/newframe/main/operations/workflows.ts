import log from 'electron-log'

import accounts from '../accounts'
import nameResolution from '../nameResolution'
import provider from '../provider'
import { arraysEqual } from '../../resources/utils'

export function selectAccount(accountId: string) {
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

export async function resolveName(name: string) {
  log.debug('Resolving name', { name })

  try {
    return await nameResolution.resolveAddress(name)
  } catch (error) {
    log.warn(`Could not resolve name ${name}:`, error)
    throw error
  }
}
