import { requireAccounts } from '../../visual/stages/helpers.ts'
import type { ExtensionStage } from '../types.ts'
import { inPopup, selectPopupAccount, waitForDappOutput, waitForPopupAccount } from './helpers.ts'

export const extensionSharesAnotherAccountStage: ExtensionStage = {
  name: 'extension shares another account',
  async run(context) {
    const { driver, extension, runtime } = context
    const { dapp } = extension
    const { harness, vitalik } = await requireAccounts(context)

    await inPopup(extension, async (popup) => {
      await popup.getByRole('button', { name: 'Account', exact: true }).click()
      await popup.getByRole('button', { name: 'Request more accounts' }).click()
      await driver.shareExtensionAccounts([harness.address, vitalik.address], 'ext-04-tray-share-vitalik.png')
      await driver.waitForState(
        (state) => {
          const shared = state.main?.extensionAccess?.[extension.extensionId]?.accounts ?? []
          return shared.length === 2 && shared.includes(harness.id) && shared.includes(vitalik.id)
        },
        5_000,
        'The extension was not given the harness account and vitalik.eth'
      )

      await popup.getByText('2 shared accounts', { exact: true }).waitFor()
      // The extension has chosen no account of its own yet, so it acts as the desktop app's selection once
      // that is shared with it.
      await waitForPopupAccount(popup, vitalik)
      await runtime.screenshot(popup, 'ext-04-popup-two-shared-accounts.png')

      // vitalik.eth has no account access grant for the dapp, so the dapp sees no account.
      await selectPopupAccount(popup, vitalik)
      await waitForDappOutput(dapp, 'Account', '')
      await runtime.screenshot(dapp, 'ext-04-dapp-vitalik-without-access.png')

      await selectPopupAccount(popup, harness)
      await waitForDappOutput(dapp, 'Account', harness.address)
    })
  }
}
