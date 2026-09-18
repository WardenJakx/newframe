import { getSignerType, isSignerReady } from '../../../platform/signing/domain/index.js'
import type { SafeOwnerAccount } from '../domain/safe.js'
import type { Account } from '../domain/state/account.js'

export function deriveSafeOwners(
  safeAccount: Account,
  accounts: Account[],
  signers: Record<string, { type: string; status: string }>,
  appLock: { locked: boolean }
): Record<string, SafeOwnerAccount[]> {
  const candidates = accounts.filter(
    (account) => account.profileId === safeAccount.profileId && account.safe === undefined
  )
  return Object.fromEntries(
    Object.entries(safeAccount.safe ?? {}).map(([chainId, deployment]) => {
      const owners = new Set(deployment.configuration.owners.map((address) => address.toLowerCase()))
      const matches = candidates
        .filter((account) => owners.has(account.address.toLowerCase()))
        .map((account): SafeOwnerAccount => {
          const signer = signers[account.signer]
          const signerType = (signer?.type || account.lastSignerType || 'address').toLowerCase()
          const signingType = getSignerType(signer?.type.toLowerCase() ?? '')
          const historicalType = getSignerType(account.lastSignerType.toLowerCase())
          const watchOnly =
            !signingType && !historicalType && (!account.signer || signer?.type.toLowerCase() === 'address')
          let status: SafeOwnerAccount['status'] = 'unavailable'
          if (watchOnly) {
            status = 'watch-only'
          } else if (signer && signingType && isSignerReady(signer) && !appLock.locked) {
            status = 'ready'
          }
          let signerStatus = signer?.status || 'Signer unavailable'
          if (status === 'watch-only') {
            signerStatus = 'Watch-only account'
          } else if (appLock.locked) {
            signerStatus = 'Wallet locked'
          } else if (status === 'unavailable' && (!signer || isSignerReady(signer))) {
            signerStatus = 'Signer unavailable'
          }
          return {
            accountId: account.id,
            name: account.name,
            address: account.address,
            created: account.created,
            signerType,
            signerAttached: Boolean(signer && signingType),
            signerStatus,
            status
          }
        })
      return [chainId, matches]
    })
  )
}
