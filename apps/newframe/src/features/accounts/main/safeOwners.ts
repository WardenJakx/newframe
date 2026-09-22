import type { SafeOwnerAccount } from '../domain/safe.js'
import type { Account } from '../domain/state/account.js'
import { safeExecutorCandidates, safeOwnerCandidates } from './signingCapability.js'

export function deriveSafeOwners(
  safeAccount: Account,
  accounts: Account[],
  signers: Record<string, { type: string; status: string; addresses?: string[] } | undefined>,
  appLock: { locked: boolean }
): Record<string, SafeOwnerAccount[]> {
  return Object.fromEntries(
    Object.keys(safeAccount.safe ?? {}).map((chainId) => [
      chainId,
      safeOwnerCandidates(safeAccount, Number(chainId), accounts, signers, appLock) as SafeOwnerAccount[]
    ])
  )
}

export function deriveSafeExecutors(
  safeAccount: Account,
  accounts: Account[],
  signers: Record<string, { type: string; status: string; addresses?: string[] } | undefined>,
  appLock: { locked: boolean }
): SafeOwnerAccount[] {
  return safeExecutorCandidates(safeAccount, accounts, signers, appLock)
}
