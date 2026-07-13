import type { VisualStage } from '../types.ts'

export const tradeMarketStage: VisualStage = {
  name: 'trade market e2e',
  async run({ driver, tray }) {
    const tradePage = await driver.openTradeTicket()

    await driver.ensureTradeSellSide(tradePage)
    await tradePage.getByLabel('WETH amount').fill('0.01')
    await tradePage
      .getByRole('button', { name: /Approve WETH/i })
      .waitFor({ state: 'visible', timeout: 20_000 })
    await driver.screenshot(tradePage, '21a-trade-market-quoted.png')
    await tradePage.getByRole('button', { name: /Approve WETH/i }).click()

    const approveRequest = await driver.waitForCurrentRequest('transaction', new Set(), 30_000)
    await driver.screenshot(tray, '21b-trade-market-approve-review.png')
    await driver.signCurrentTransaction(approveRequest, '21c-trade-market-approve-submitted.png', [
      '21b-trade-market-approve-warning.png',
      '21c-trade-market-approve-post-sign-warning.png'
    ])

    await tradePage
      .getByRole('button', { name: /Review\/sign/i })
      .waitFor({ state: 'visible', timeout: 20_000 })
    await driver.screenshot(tradePage, '21d-trade-market-ready-to-sign.png')
    await tradePage.getByRole('button', { name: /Review\/sign/i }).click()

    const signRequest = await driver.waitForCurrentRequest('signTypedData', new Set(), 30_000)
    await driver.screenshot(tray, '21e-trade-market-sign-review.png')
    await driver.signCurrentSignature(signRequest, '21f-trade-market-sign-submitted.png')

    await driver.waitForFlashOrder(
      (order) => order.orderType === 'market' && order.status === 'filled',
      30_000,
      'Market Flash order did not fill'
    )
    await driver.screenshot(tray, '21g-trade-market-filled.png')
    await driver.clearPanelAndOverlays()
  }
}
