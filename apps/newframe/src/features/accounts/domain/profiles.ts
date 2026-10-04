import type { Main } from '@newframe/schema/wallet-state'

export function getProfileAccountIds(
  main: Pick<Main, 'accounts' | 'accountOrder'>,
  profileId: string
): string[] {
  const ordered: string[] = []
  const seen = new Set<string>()

  for (const id of [...main.accountOrder, ...Object.keys(main.accounts)]) {
    if (!seen.has(id) && main.accounts[id]?.profileId === profileId) {
      seen.add(id)
      ordered.push(id)
    }
  }

  return ordered
}
