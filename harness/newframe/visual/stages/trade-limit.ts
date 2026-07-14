import { sleep } from '../../core/utils.ts'
import type { VisualStage } from '../types.ts'

export const tradeLimitStage: VisualStage = {
  name: 'trade non-market e2e',
  async run({ driver, tray }) {
    const tradePage = await driver.openTradeTicket()

    await driver.ensureTradeSellSide(tradePage)
    await tradePage.getByRole('tab', { name: 'Limit' }).click()
    await tradePage.getByLabel('Limit price').fill('2500')
    await tradePage.getByLabel('WETH amount', { exact: true }).fill('0.01')
    await tradePage
      .getByRole('button', { name: /Review\/sign/i })
      .waitFor({ state: 'visible', timeout: 20_000 })
    await driver.screenshot(tradePage, '22a-trade-limit-quoted.png')
    const existingOrderIds = new Set(Object.keys((await driver.getAppState()).main?.orders || {}))
    await tradePage.getByRole('button', { name: /Review\/sign/i }).click()

    const signRequest = await driver.waitForCurrentRequest('signTypedData', new Set(), 30_000)
    await driver.screenshot(tray, '22b-trade-limit-sign-review.png')
    await driver.signCurrentSignature(signRequest, '22c-trade-limit-sign-submitted.png')

    const order = await driver.waitForFlashOrder(
      (candidate) =>
        candidate.orderType === 'limit' &&
        candidate.status === 'accepted' &&
        Boolean(candidate.open) &&
        Boolean(candidate.orderId) &&
        !existingOrderIds.has(candidate.orderId || ''),
      15_000,
      'A newly submitted limit Flash order was not accepted as open'
    )

    await sleep(4_000)

    const latest = await driver.getAppState()
    const stored = order.orderId ? latest.main?.orders?.[order.orderId] : undefined
    if (!stored?.open || stored.status !== 'accepted')
      driver.fail('Limit Flash order filled or closed unexpectedly')

    if (!order.orderId) driver.fail('The new limit Flash order has no order id')
    await driver.assertFlashOrderVisible(order.orderId)
    await driver.screenshot(tray, '22d-trade-limit-open.png')
    await driver.clearPanelAndOverlays()
  }
}
