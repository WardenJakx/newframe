import { getProfileAccountIds, type Main } from '../../../app/contracts/state/main.ts'
import type { ExtensionAccess } from './state/extensionAccess.ts'

type AccessMain = Pick<
  Main,
  'accounts' | 'accountOrder' | 'currentAccount' | 'currentProfile' | 'extensionAccess'
>

const noAccess: ExtensionAccess = { all: false, accounts: [], selected: {} }

export function extensionAccess(main: Pick<Main, 'extensionAccess'>, extensionId: string): ExtensionAccess {
  return (
    (Object.hasOwn(main.extensionAccess, extensionId) ? main.extensionAccess[extensionId] : undefined) ??
    noAccess
  )
}

export function canExtensionSee(access: ExtensionAccess, accountId: string) {
  return access.all || access.accounts.includes(accountId)
}

/** Only accounts in the current profile are ever disclosed to the extension. */
export function visibleExtensionAccountIds(main: AccessMain, extensionId: string) {
  const access = extensionAccess(main, extensionId)
  return getProfileAccountIds(main, main.currentProfile).filter((id) => canExtensionSee(access, id))
}

/**
 * The account the extension acts as: its last selection in this profile, else the app's selection
 * when the extension may see it, else the first visible account. Empty when nothing is visible.
 */
export function activeExtensionAccountId(main: AccessMain, extensionId: string) {
  const visible = visibleExtensionAccountIds(main, extensionId)
  const selected: string | undefined = extensionAccess(main, extensionId).selected[main.currentProfile]
  return [selected, main.currentAccount].find((id) => id && visible.includes(id)) ?? visible[0] ?? ''
}

/** Replaces the grants for the current profile. Grants in other profiles persist. */
export function grantExtensionAccess(
  main: AccessMain,
  extensionId: string,
  all: boolean,
  accountIds: readonly string[]
): ExtensionAccess {
  const access = extensionAccess(main, extensionId)
  const profileAccountIds = getProfileAccountIds(main, main.currentProfile)
  return {
    all,
    accounts: [
      ...access.accounts.filter((id) => !profileAccountIds.includes(id)),
      ...profileAccountIds.filter((id) => accountIds.includes(id))
    ],
    selected: access.selected
  }
}
