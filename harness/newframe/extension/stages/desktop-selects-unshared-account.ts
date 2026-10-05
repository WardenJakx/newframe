import { requireAccounts } from '../../visual/stages/helpers.ts'
import type { ExtensionStage } from '../types.ts'
import { dappProviderAccounts, inPopup, waitForDappOutput, waitForPopupAccount } from './helpers.ts'

// The extension account stays put when the desktop app selects another account (GLOSSARY.md).
export const desktopSelectsUnsharedAccountStage: ExtensionStage = {
  name: 'desktop selects an account the extension cannot see',
  async run(context) {
    const { driver, extension, runtime, tray } = context
    const { dapp } = extension
    const { harness, vitalik } = await requireAccounts(context)

    await driver.selectAccount(vitalik, vitalik.address)
    await runtime.screenshot(tray, 'ext-03-tray-vitalik-selected.png')

    await inPopup(extension, async (popup) => {
      await waitForPopupAccount(popup, harness)
      await runtime.screenshot(popup, 'ext-03-popup-account.png')
    })

    await waitForDappOutput(dapp, 'Account', harness.address)
    const accounts = await dappProviderAccounts(dapp)
    if (accounts.join(',').toLowerCase() !== harness.address) {
      runtime.fail(`The dapp's eth_accounts is [${accounts.join(', ')}], expected [${harness.address}]`)
    }
    await runtime.screenshot(dapp, 'ext-03-dapp-account.png')
  }
}
