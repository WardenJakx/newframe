import { oneEthWei } from '../driver.ts'
import type { VisualStage } from '../types.ts'
import { requireAccounts, revealAssetDetailsButton } from './helpers.ts'

export const sendStage: VisualStage = {
  name: 'built-in send',
  async run(context) {
    const { anvil, driver, runtime, tray } = context
    const { vitalik } = await requireAccounts(context)
    await driver.clearPanelAndOverlays()
    const sendEthButton = tray.getByRole('button', { name: 'Send ETH' })

    if (!(await sendEthButton.isVisible({ timeout: 1_000 }).catch(() => false))) {
      await (await revealAssetDetailsButton(tray, 'ETH')).click()
      await tray.getByRole('dialog', { name: 'Asset details' }).waitFor({ state: 'visible' })
    }

    await sendEthButton.click()
    const sendPage = await driver.waitForElectronPage('bundle/sidetray.html')
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
    const sign = tray.getByRole('button', { name: 'Sign', exact: true })
    await sign.waitFor({ state: 'visible', timeout: 5_000 })
    const reviewLayout = await sign.evaluate((button) => {
      const details = document.querySelector('[aria-label="Transaction details"]')
      const footer = button.closest('footer')
      let scroller = details?.parentElement || null
      while (scroller && !['auto', 'scroll'].includes(getComputedStyle(scroller).overflowY)) {
        scroller = scroller.parentElement
      }
      if (!footer || !scroller) return null
      const footerBounds = footer.getBoundingClientRect()
      const scrollBounds = scroller.getBoundingClientRect()
      return {
        availableHeight: footerBounds.top - scrollBounds.top,
        footerGap: footerBounds.top - scrollBounds.bottom,
        scrollHeight: scrollBounds.height
      }
    })
    if (
      !reviewLayout ||
      reviewLayout.footerGap < -1 ||
      reviewLayout.footerGap > 24 ||
      reviewLayout.scrollHeight < reviewLayout.availableHeight - 1
    ) {
      runtime.fail('Send review scroll area must fill the panel down to the action footer')
    }

    const outgoingIcon = tray.locator('[data-effect-icon-direction="out"]').first()
    await outgoingIcon.waitFor({ state: 'visible', timeout: 5_000 })
    const outgoingToneApplied = await outgoingIcon.evaluate((icon) => {
      const root = icon.parentElement
      const amount = root?.lastElementChild
      if (!root || !amount) return false
      const iconStyle = getComputedStyle(icon)
      const amountStyle = getComputedStyle(amount)
      const rootStyle = getComputedStyle(root)
      return (
        iconStyle.color === amountStyle.color &&
        iconStyle.backgroundColor !== rootStyle.backgroundColor &&
        iconStyle.borderColor !== rootStyle.backgroundColor
      )
    })
    if (!outgoingToneApplied) runtime.fail('Outgoing transaction effect icon must use the danger tone')
    await runtime.screenshot(tray, '14-send-review.png')

    const reviewBack = tray.getByRole('button', { name: 'Back', exact: true })
    const backBounds = await reviewBack.boundingBox()
    if (!backBounds || backBounds.x < 0 || backBounds.y < 0) {
      runtime.fail('Send review back button must remain inside the request panel')
    }

    await driver.signCurrentTransaction(sendRequest, '15-send-submitted.png', [
      '14a-send-warning.png',
      '14b-send-post-sign-warning.png'
    ])
    await anvil.waitForBalance(vitalik.address, vitalikBalanceBefore + oneEthWei)
    await driver.clearPanelAndOverlays()
  }
}
