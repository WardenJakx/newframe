/** Display classification only; signer history and signing permissions remain separate. */
export function accountDisplayType(account?: {
  lastSignerType?: string
  safe?: Record<string, unknown>
  accountType?: string
}) {
  if (account?.safe && Object.keys(account.safe).length) {
    return 'safe'
  }
  return account?.accountType ?? account?.lastSignerType ?? ''
}
