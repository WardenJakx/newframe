import type { Page } from 'playwright-core'

import type { AccountInfo } from '../../visual/types.ts'
import type { ExtensionBrowser } from '../browser.ts'

type DappOutput = 'Account' | 'Chain' | 'Result' | 'Error'

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const exactly = (text: string) => new RegExp(`^${escapeRegExp(text)}$`, 'i')
const shortAddress = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`

const dappOutput = (dapp: Page, label: DappOutput) => dapp.getByRole('status', { name: label, exact: true })

/** Waits until the dapp shows exactly `expected`; an empty string waits for an empty output. */
export async function waitForDappOutput(dapp: Page, label: DappOutput, expected: string, timeout = 20_000) {
  const output = dappOutput(dapp, label)
  await output
    .filter(expected ? { hasText: exactly(expected) } : { hasNotText: /\S/ })
    // An empty output has no size, so it is never visible.
    .waitFor({ state: 'attached', timeout })
    .catch(async () => {
      throw new Error(`The dapp's ${label} is "${await output.textContent()}", expected "${expected}"`)
    })
}

/** Waits for the outcome of the dapp's last action and returns its result; a request the dapp saw fail throws. */
export async function dappResult(dapp: Page, timeout = 60_000) {
  const result = dappOutput(dapp, 'Result')
  const error = dappOutput(dapp, 'Error')
  await result.or(error).filter({ hasText: /\S/ }).waitFor({ timeout })
  const message = await error.textContent()
  if (message) {
    throw new Error(`The dapp's request failed: ${message}`)
  }
  return (await result.textContent()) ?? ''
}

/** What the dapp's provider answers to `eth_accounts`, without prompting. */
export async function dappProviderAccounts(dapp: Page) {
  const accounts = await dapp.evaluate(async () => {
    const { ethereum } = window as Window & {
      ethereum?: { request(args: { method: string }): Promise<unknown> }
    }
    const result = await ethereum?.request({ method: 'eth_accounts' })
    return Array.isArray(result) ? result.map(String) : null
  })
  if (!accounts) {
    throw new Error('The dapp provider did not answer eth_accounts with a list')
  }
  return accounts
}

/** Opens the popup for `use` and closes it afterwards; a failed step leaves it open for the failure screenshots. */
export async function inPopup<T>(extension: ExtensionBrowser, use: (popup: Page) => Promise<T>) {
  const popup = await extension.openPopup()
  const value = await use(popup)
  await popup.close()
  return value
}

const popupAccountSelector = (popup: Page) => popup.getByRole('button', { name: 'Account', exact: true })

/** Waits until the popup's account selector shows `account`, or that the extension has no account. */
export async function waitForPopupAccount(popup: Page, account: AccountInfo | undefined) {
  const selector = popupAccountSelector(popup)
  const shown = account
    ? selector
        .filter({ hasText: account.name ?? '' })
        .filter({ hasText: new RegExp(escapeRegExp(shortAddress(account.address)), 'i') })
    : selector.filter({ hasText: 'Choose account' })
  await shown.waitFor().catch(async () => {
    throw new Error(
      `The popup's account is "${await selector.textContent()}", expected ${account?.name ?? 'none'}`
    )
  })
}

export async function selectPopupAccount(popup: Page, account: AccountInfo) {
  await popupAccountSelector(popup).click()
  await popup
    .getByRole('option', { name: new RegExp(escapeRegExp(shortAddress(account.address)), 'i') })
    .click()
  await waitForPopupAccount(popup, account)
}
