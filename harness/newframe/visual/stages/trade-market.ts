import type { VisualStage } from '../types.ts'

export const tradeMarketStage: VisualStage = {
  name: 'trade market e2e',
  async run({ driver, tray }) {
    const tradePage = await driver.openTradeTicket()

    await driver.ensureTradeSellSide(tradePage)
    await tradePage.getByLabel('WETH amount', { exact: true }).fill('0.01')
    await tradePage
      .getByRole('button', { name: /Approve WETH/i })
      .waitFor({ state: 'visible', timeout: 20_000 })
    await driver.screenshot(tradePage, '21a-trade-market-quoted.png')
    await tradePage.getByRole('button', { name: /Approve WETH/i }).click()

    const approveRequest = await driver.waitForCurrentRequest('transaction', new Set(), 30_000)
    await driver.screenshot(tray, '21b-trade-market-approve-review.png')

    await tray.getByRole('button', { name: /Calldata digest/i }).click()
    await tray.getByText('Raw Transaction', { exact: true }).waitFor({ state: 'visible' })
    const rawDataFits = await tray.getByText('Raw Transaction', { exact: true }).evaluate(() => {
      const root = document.documentElement
      return root.scrollWidth <= root.clientWidth
    })
    if (!rawDataFits) driver.fail('Raw transaction values must not overflow the tray viewport')
    await driver.screenshot(tray, '21b1-trade-market-raw-data.png')
    await tray.getByRole('button', { name: 'Back', exact: true }).click()
    await tray.getByText('Transaction effects', { exact: true }).waitFor({ state: 'visible' })

    await driver.signCurrentTransaction(approveRequest, '21c-trade-market-approve-submitted.png', [
      '21b-trade-market-approve-warning.png',
      '21c-trade-market-approve-post-sign-warning.png'
    ])

    await tradePage
      .getByRole('button', { name: /Review\/sign/i })
      .waitFor({ state: 'visible', timeout: 20_000 })
    await driver.screenshot(tradePage, '21d-trade-market-ready-to-sign.png')
    const existingOrderIds = new Set(Object.keys((await driver.getAppState()).main?.orders || {}))
    await tradePage.getByRole('button', { name: /Review\/sign/i }).click()

    const signRequest = await driver.waitForCurrentRequest('signTypedData', new Set(), 30_000)
    await driver.screenshot(tray, '21e-trade-market-sign-review.png')
    await driver.signCurrentSignature(signRequest, '21f-trade-market-sign-submitted.png')

    const order = await driver.waitForFlashOrder(
      (order) =>
        order.orderType === 'market' &&
        order.status === 'filled' &&
        Boolean(order.orderId) &&
        !existingOrderIds.has(order.orderId || ''),
      30_000,
      'A newly submitted market Flash order did not fill'
    )
    if (!order.orderId) driver.fail('The new market Flash order has no order id')
    await driver.assertFlashOrderVisible(order.orderId)
    await driver.screenshot(tray, '21g-trade-market-filled.png')
    await driver.clearPanelAndOverlays()
  }
}
