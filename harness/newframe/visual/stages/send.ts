import { oneEthWei } from '../driver.ts'
import type { VisualStage } from '../types.ts'
import { assertInsideViewport, requireAccounts, revealAssetDetailsButton } from './helpers.ts'

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
    await sendPage.getByRole('button', { name: 'Select send token' }).click()
    const tokenMenu = sendPage.getByRole('listbox', { name: 'Select send token' }).locator('..')
    await tokenMenu.waitFor({ state: 'visible' })
    await assertInsideViewport(tokenMenu, runtime, 'Send token menu')
    await sendPage.keyboard.press('Escape')
    await runtime.screenshot(sendPage, '11-send-open.png')

    const recipientSelector = sendPage.getByRole('button', { name: 'Toggle recipients' })
    await recipientSelector.click()
    await sendPage
      .getByRole('button', { name: /vitalik\.eth/i })
      .first()
      .click()
    await runtime.screenshot(sendPage, '12-send-recipient-vitalik.png')
    await sendPage.getByRole('textbox', { name: 'Amount' }).fill('1')
    await runtime.screenshot(sendPage, '13-send-amount-1-eth.png')

    const vitalikBalanceBefore = await anvil.balance(vitalik.address)
    const beforeSubmit = await driver.getAppState()
    const senderAccountId = beforeSubmit.main?.currentAccount
    const priorOperationIds = new Set(Object.keys(beforeSubmit.operations || {}))
    await sendPage.getByText('Proceed', { exact: true }).click()

    const operationState = await driver.waitForState(
      (state) =>
        Object.entries(state.operations || {}).some(
          ([operationId, entry]) =>
            !priorOperationIds.has(operationId) &&
            entry.operation?.type === 'send.submit' &&
            entry.operation.status === 'pending'
        ),
      5_000,
      'Send did not publish a pending canonical operation'
    )
    const sendOperation =
      Object.entries(operationState.operations || {}).find(
        ([operationId, entry]) =>
          !priorOperationIds.has(operationId) &&
          entry.operation?.type === 'send.submit' &&
          entry.operation.status === 'pending'
      ) || runtime.fail('Pending send operation disappeared before review')
    const [sendOperationId] = sendOperation

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

    const outgoingEffect = tray.locator('[data-effect-direction="out"]').first()
    await outgoingEffect.waitFor({ state: 'visible', timeout: 5_000 })
    const outgoingDeltaApplied = await outgoingEffect.evaluate((root) => {
      const icon = root.querySelector<HTMLElement>('[data-effect-icon-direction="neutral"]')
      const amount = root.lastElementChild
      if (!icon || !amount) return false
      const iconStyle = getComputedStyle(icon)
      const amountStyle = getComputedStyle(amount)
      return (
        (amount.textContent || '').trim().startsWith('-') &&
        icon.dataset.effectIconDirection === 'neutral' &&
        iconStyle.color !== amountStyle.color
      )
    })
    if (!outgoingDeltaApplied) {
      runtime.fail('Outgoing transaction effect must show direction on the signed delta, not the token icon')
    }
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
    const completedState = await driver.waitForState(
      (state) => {
        const status = state.operations?.[sendOperationId]?.operation?.status
        return status === 'succeeded' || status === 'failed'
      },
      15_000,
      'Send operation did not reach a terminal canonical state'
    )
    const completedOperation = completedState.operations?.[sendOperationId]?.operation
    if (completedOperation?.status === 'failed') {
      runtime.fail(completedOperation.error?.message || 'Canonical send operation failed')
    }
    const sendTransactionHash =
      completedOperation?.entityRefs?.find((reference) => reference.type === 'transaction')?.id ||
      runtime.fail('Successful send operation did not reference a transaction')
    const submittedAccountId = completedOperation?.entityRefs?.find(
      (reference) => reference.type === 'account'
    )?.id
    if (senderAccountId && submittedAccountId !== senderAccountId) {
      runtime.fail('Successful send operation did not reference the submitting account')
    }

    const activityState = await driver.waitForState(
      (state) => Boolean(state.main?.activity?.[sendTransactionHash]),
      15_000,
      'Submitted send transaction did not appear in canonical activity'
    )
    const sendActivity =
      activityState.main?.activity?.[sendTransactionHash] ||
      runtime.fail('Submitted send transaction did not project canonical activity')
    if (sendActivity.status === 'reverted') runtime.fail('Submitted send transaction reverted')
    await anvil.waitForBalance(vitalik.address, vitalikBalanceBefore + oneEthWei)
    runtime.evidence('sendOperationId', sendOperationId)
    runtime.evidence('sendTransactionHash', sendTransactionHash)
    runtime.evidence('sendActivityStatus', sendActivity.status || null)
    runtime.evidence('sendRequestId', sendRequest.handlerId)
    runtime.evidence('sendRecipient', vitalik.address)
    runtime.evidence('sendValueWei', oneEthWei.toString())
    await driver.clearPanelAndOverlays()
  }
}
