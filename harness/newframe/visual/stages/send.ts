import { oneEthWei } from '../driver.ts'
import type { VisualStage } from '../types.ts'
import { requireAccounts } from './helpers.ts'

export const sendStage: VisualStage = {
  name: 'built-in send',
  async run(context) {
    const { anvil, driver, runtime, tray } = context
    const { vitalik } = await requireAccounts(context)
    const sendEthButton = tray.getByRole('button', { name: 'Send ETH' })

    if (!(await sendEthButton.isVisible({ timeout: 1_000 }).catch(() => false))) {
      await tray.getByRole('button', { name: 'ETH asset details' }).click()
      await tray.getByRole('dialog', { name: 'Asset details' }).waitFor({ state: 'visible' })
    }

    await sendEthButton.click()
    const sendPage = await driver.waitForElectronPage('bundle/dapp.html')
    await sendPage.getByRole('textbox', { name: 'Recipient' }).waitFor({ state: 'visible', timeout: 15_000 })
    await runtime.screenshot(sendPage, '11-send-open.png')
    await sendPage
      .getByRole('button', { name: /vitalik\.eth/i })
      .first()
      .click()
    await runtime.screenshot(sendPage, '12-send-recipient-vitalik.png')
    await sendPage.getByRole('textbox', { name: 'Amount' }).fill('1')
    await runtime.screenshot(sendPage, '13-send-amount-1-eth.png')

    const vitalikBalanceBefore = await anvil.balance(vitalik.address)
    await sendPage.getByText('Proceed', { exact: true }).click()

    const sendRequest = await driver.waitForCurrentRequest('transaction', new Set(), 30_000)
    await runtime.screenshot(tray, '14-send-review.png')
    await driver.signCurrentTransaction(sendRequest, '15-send-submitted.png', [
      '14a-send-warning.png',
      '14b-send-post-sign-warning.png'
    ])
    await anvil.waitForBalance(vitalik.address, vitalikBalanceBefore + oneEthWei)
    await driver.clearPanelAndOverlays()
  }
}
