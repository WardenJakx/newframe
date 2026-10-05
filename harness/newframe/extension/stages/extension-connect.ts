import { requireAccounts } from '../../visual/stages/helpers.ts'
import type { ExtensionStage } from '../types.ts'
import { inPopup, waitForPopupAccount } from './helpers.ts'

export const extensionConnectStage: ExtensionStage = {
  name: 'extension connects and is given an account',
  async run(context) {
    const { driver, extension, runtime, services, tray } = context
    const { harness } = await requireAccounts(context)
    // Chromium starts only now, so the extension's first connection meets an unlocked, prepared desktop app.
    const { extensionId } = await services.start(extension)
    runtime.evidence('extensionId', extensionId)

    await inPopup(extension, async (popup) => {
      await popup.getByRole('button', { name: 'Approval Needed' }).waitFor({ timeout: 30_000 })
      await runtime.screenshot(popup, 'ext-01-popup-approval-needed.png')

      const request = tray.getByRole('dialog', { name: 'Extension connection request' })
      await request.waitFor({ state: 'visible' })
      await request.getByText(extensionId, { exact: true }).waitFor()
      await driver.approveExtensionConnection('ext-01-tray-connection-request.png')

      const connected = popup.getByRole('button', { name: 'Newframe Connected' })
      const reconnected = await connected
        .waitFor({ timeout: 5_000 })
        .then(() => true)
        .catch(() => false)
      runtime.evidence('extensionNeededRetry', !reconnected)
      if (!reconnected) {
        // The extension backs off between attempts; a human would not wait for it either.
        await popup.getByRole('button', { name: 'Retry connection' }).click()
        await connected.waitFor()
      }

      // An approved extension sees no accounts, so the desktop app asks which to share.
      await driver.shareExtensionAccounts([harness.address], 'ext-01-tray-share-harness-account.png')
      const state = await driver.waitForState(
        (candidate) => {
          const shared = candidate.main?.extensionAccess?.[extensionId]?.accounts
          return shared?.length === 1 && shared[0] === harness.id
        },
        5_000,
        'The extension was not given exactly the harness account'
      )
      runtime.evidence(
        'extensionSharedAccounts',
        state.main?.extensionAccess?.[extensionId]?.accounts?.join(',') ?? null
      )

      await popup.getByText('1 shared account', { exact: true }).waitFor()
      await waitForPopupAccount(popup, harness)
      await runtime.screenshot(popup, 'ext-01-popup-connected.png')
    })
  }
}
