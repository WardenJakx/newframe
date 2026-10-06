export function accountDisplayName(
  account: { name: string; ensName?: string },
  showLocalNameWithENS: boolean
) {
  return account.ensName && !showLocalNameWithENS ? account.ensName : account.name
}
