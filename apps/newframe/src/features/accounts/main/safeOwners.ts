import type { Account } from '@newframe/schema/accounts'
import type { SafeOwnerAccount } from '@newframe/schema/safe'

import { safeExecutorCandidates, safeOwnerCandidates } from './signingCapability.ts'

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
